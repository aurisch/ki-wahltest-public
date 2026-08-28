#!/usr/bin/env bash
set -euo pipefail

PRIVATE_REMOTE='https://github.com/aurisch/ki-wahltest-private.git'
PUBLIC_REMOTE='https://github.com/aurisch/ki-wahltest-public.git'
PUBLIC_ROOT_COMMIT='cac695324e63499d78e211bc3eeeea1c5518f1db'
PUBLIC_AUTHOR_NAME='Horst Aurisch'
PUBLIC_AUTHOR_EMAIL='8183501+aurisch@users.noreply.github.com'

fail() {
  printf 'PUBLIC RELEASE: FAIL — %s\n' "$1" >&2
  exit 1
}

canonical_github_url() {
  printf '%s' "$1" | sed -E 's#^git@github\.com:#https://github.com/#; s#\.git$##'
}

for command in git npm node tar rsync mktemp; do
  command -v "$command" >/dev/null 2>&1 || fail "Benötigtes Programm fehlt: $command"
done

SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PRIVATE_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || fail 'Nicht innerhalb eines Git-Repositories gestartet.'
[ "$SCRIPT_ROOT" = "$PRIVATE_ROOT" ] || fail 'Das Skript muss aus seinem privaten Entwicklungsrepository gestartet werden.'

PRIVATE_ORIGIN="$(git -C "$PRIVATE_ROOT" remote get-url origin 2>/dev/null)" || fail 'Remote origin fehlt.'
[ "$(canonical_github_url "$PRIVATE_ORIGIN")" = "$(canonical_github_url "$PRIVATE_REMOTE")" ] || fail 'origin ist nicht aurisch/ki-wahltest-private.'
[ "$(git -C "$PRIVATE_ROOT" branch --show-current)" = 'main' ] || fail 'Der Public Release muss von main vorbereitet werden.'
[ -z "$(git -C "$PRIVATE_ROOT" status --porcelain --untracked-files=all)" ] || fail 'Der private Working Tree ist nicht sauber.'

SOURCE_COMMIT="$(git -C "$PRIVATE_ROOT" rev-parse HEAD)"
SOURCE_SHORT="$(git -C "$PRIVATE_ROOT" rev-parse --short=7 HEAD)"
printf 'Private source commit: %s\n' "$SOURCE_COMMIT"
printf '%s\n' 'Running release scan and project checks ...'

cd "$PRIVATE_ROOT"
npm run release:check
npm run check
npm test
npm run check:launch

DEFAULT_PUBLIC_DIR="$(dirname "$PRIVATE_ROOT")/ki-wahltest-public"
PUBLIC_DIR="${PUBLIC_RELEASE_DIR:-$DEFAULT_PUBLIC_DIR}"
DRY_RUN="${PUBLIC_RELEASE_DRY_RUN:-0}"
[ "$DRY_RUN" = '0' ] || [ "$DRY_RUN" = '1' ] || fail 'PUBLIC_RELEASE_DRY_RUN muss 0 oder 1 sein.'
if [ "$DRY_RUN" = '1' ]; then
  [ -n "${PUBLIC_RELEASE_DIR:-}" ] || fail 'Dry-Run erfordert ein explizites temporäres PUBLIC_RELEASE_DIR.'
  [ ! -e "$PUBLIC_DIR" ] || fail 'Das Dry-Run-Ziel muss neu und leer sein.'
fi

if [ -e "$PUBLIC_DIR" ] && [ ! -d "$PUBLIC_DIR/.git" ]; then
  fail "Ziel existiert, ist aber keine Public-Repository-Arbeitskopie: $PUBLIC_DIR"
fi

if [ ! -d "$PUBLIC_DIR/.git" ]; then
  git clone --branch main --single-branch "$PUBLIC_REMOTE" "$PUBLIC_DIR"
fi

PUBLIC_ORIGIN="$(git -C "$PUBLIC_DIR" remote get-url origin 2>/dev/null)" || fail 'Public-Arbeitskopie hat kein origin.'
[ "$(canonical_github_url "$PUBLIC_ORIGIN")" = "$(canonical_github_url "$PUBLIC_REMOTE")" ] || fail 'Public-Arbeitskopie zeigt nicht auf aurisch/ki-wahltest-public.'
[ -z "$(git -C "$PUBLIC_DIR" status --porcelain --untracked-files=all)" ] || fail 'Public-Arbeitskopie ist nicht sauber.'

git -C "$PUBLIC_DIR" fetch origin main
git -C "$PUBLIC_DIR" checkout main
git -C "$PUBLIC_DIR" merge --ff-only origin/main

PUBLIC_ROOTS="$(git -C "$PUBLIC_DIR" rev-list --max-parents=0 HEAD)"
[ "$PUBLIC_ROOTS" = "$PUBLIC_ROOT_COMMIT" ] || fail 'Public-Repository besitzt nicht den erwarteten Clean-Snapshot-Root.'
PUBLIC_COMMIT_BEFORE="$(git -C "$PUBLIC_DIR" rev-parse HEAD)"

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ki-wahltest-public.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT
SNAPSHOT_DIR="$TEMP_DIR/snapshot"
mkdir "$SNAPSHOT_DIR"

git -C "$PRIVATE_ROOT" archive --format=tar "$SOURCE_COMMIT" | tar -xf - -C "$SNAPSHOT_DIR"
rsync --archive --delete --exclude='.git/' "$SNAPSHOT_DIR/" "$PUBLIC_DIR/"

printf '\nPublic repository status after snapshot:\n'
git -C "$PUBLIC_DIR" status --short

if [ -z "$(git -C "$PUBLIC_DIR" status --porcelain --untracked-files=all)" ]; then
  printf '\nPublic release prepared successfully; no content changes detected.\n'
  printf 'Private source commit: %s\n' "$SOURCE_COMMIT"
  printf 'Public commit before:  %s\n' "$PUBLIC_COMMIT_BEFORE"
  printf 'Prepared commit:       %s (unchanged)\n' "$PUBLIC_COMMIT_BEFORE"
  printf 'Changed files:         0\n'
  printf 'Audits:                 PASS\n'
  printf 'Review the repository in:\n%s\n' "$PUBLIC_DIR"
  exit 0
fi

git -C "$PUBLIC_DIR" add -A
CHANGED_FILES="$(git -C "$PUBLIC_DIR" diff --cached --name-only | wc -l | tr -d ' ')"
if [ "$DRY_RUN" = '1' ]; then
  printf '\nPublic release dry-run completed successfully; no commit or push was created.\n'
  printf 'Private source commit: %s\n' "$SOURCE_COMMIT"
  printf 'Public commit before:  %s\n' "$PUBLIC_COMMIT_BEFORE"
  printf 'Changed files staged:  %s\n' "$CHANGED_FILES"
  printf 'Audits:                 PASS\n'
  printf '\nInspect the disposable dry-run in:\n%s\n' "$PUBLIC_DIR"
  exit 0
fi

git -C "$PUBLIC_DIR" \
  -c user.name="$PUBLIC_AUTHOR_NAME" \
  -c user.email="$PUBLIC_AUTHOR_EMAIL" \
  -c commit.gpgsign=false \
  commit -m "Public release from $SOURCE_SHORT"
PREPARED_COMMIT="$(git -C "$PUBLIC_DIR" rev-parse HEAD)"

printf '\nPublic release prepared successfully.\n'
printf 'Private source commit: %s\n' "$SOURCE_COMMIT"
printf 'Public commit before:  %s\n' "$PUBLIC_COMMIT_BEFORE"
printf 'Prepared commit:       %s\n' "$PREPARED_COMMIT"
printf 'Changed files:         %s\n' "$CHANGED_FILES"
printf 'Audits:                 PASS\n'
printf '\nReview the changes in:\n%s\n' "$PUBLIC_DIR"
printf '\nTo publish:\ncd "%s"\ngit push origin main\n' "$PUBLIC_DIR"
