#!/usr/bin/env bash
# Pinned, reference-only source mirrors under .agent_sources/ (gitignored).
# Refs come from package.json, so bumping a pin and re-running keeps them matched.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REFRESH=false
case "${1:-}" in
  --refresh) REFRESH=true ;;
  '') ;;
  -h|--help) echo 'Usage: scripts/vendor-agent-sources.sh [--refresh]'; exit 0 ;;
  *) echo 'Unknown argument' >&2; exit 1 ;;
esac

pin() {
  node -p "const p=require('${ROOT}/package.json'); (p.devDependencies?.['$1'] ?? p.dependencies?.['$1']).replace(/^npm:.*@/, '')"
}

# git_source <remote> <dest-relative-to-.agent_sources> <tag-or-commit>
git_source() {
  local remote="$1" rel="$2" ref="$3" dest="${ROOT}/.agent_sources/$2"
  if [[ -d "$dest/.git" ]]; then
    if [[ -n "$(git -C "$dest" status --porcelain)" ]]; then
      echo "Refusing to replace modified mirror: $rel" >&2
      exit 1
    fi
    local wanted
    wanted="$(git -C "$dest" rev-parse "${ref}^{commit}" 2>/dev/null || true)"
    if [[ -n "$wanted" && "$wanted" == "$(git -C "$dest" rev-parse HEAD)" ]]; then
      return
    fi
    if [[ "$REFRESH" != true ]]; then
      echo "Mirror ref mismatch: $rel; pass --refresh" >&2
      exit 1
    fi
    git -C "$dest" fetch --tags origin
  elif [[ -e "$dest" ]]; then
    echo "Refusing to overwrite a non-mirror directory: $rel" >&2
    exit 1
  else
    mkdir -p "$(dirname "$dest")"
    git clone --filter=blob:none --no-checkout "$remote" "$dest"
  fi
  git -C "$dest" checkout --quiet --detach "$ref"
  local commit
  commit="$(git -C "$dest" rev-parse HEAD)"
  printf '\n.agent-source.json\n' >> "$dest/.git/info/exclude"
  printf '{"type":"git-source","remote":"%s","ref":"%s","commit":"%s","addedAt":"%s","note":"Pinned reference-only source mirror."}\n' \
    "$remote" "$ref" "$commit" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$dest/.agent-source.json"
  printf '%s @ %s (%s)\n' "$rel" "$ref" "$commit"
}

# npm_source <name> <version> <sha512-integrity>
# For sources whose git repository is no longer public; the published tarball ships src/.
npm_source() {
  local name="$1" version="$2" integrity="$3" dest="${ROOT}/.agent_sources/npm/$1@$2"
  if [[ -f "$dest/.agent-source.json" ]] && grep -qF "\"integrity\":\"${integrity}\"" "$dest/.agent-source.json"; then
    return
  fi
  if [[ -e "$dest" && "$REFRESH" != true ]]; then
    echo "Mirror mismatch: npm/$name@$version; pass --refresh" >&2
    exit 1
  fi
  local tmp tarball actual
  tmp="$(mktemp -d)"
  tarball="https://registry.npmjs.org/${name}/-/${name##*/}-${version}.tgz"
  curl -fsSL "$tarball" -o "$tmp/pkg.tgz"
  actual="sha512-$(openssl dgst -sha512 -binary "$tmp/pkg.tgz" | base64 | tr -d '\n')"
  if [[ "$actual" != "$integrity" ]]; then
    echo "Integrity mismatch for $name@$version" >&2
    exit 1
  fi
  mkdir -p "$dest"
  tar xzf "$tmp/pkg.tgz" -C "$dest" --strip-components 1
  printf '{"type":"npm-source","name":"%s","version":"%s","tarball":"%s","integrity":"%s","addedAt":"%s","note":"Pinned reference-only source mirror."}\n' \
    "$name" "$version" "$tarball" "$integrity" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$dest/.agent-source.json"
  printf 'npm/%s@%s (%s)\n' "$name" "$version" "$integrity"
}

git_source https://github.com/alchemy-run/alchemy.git github.com/alchemy-run/alchemy "v$(pin alchemy)"
git_source https://github.com/Effect-TS/effect.git github.com/Effect-TS/effect "effect@$(pin effect)"
# PVE API schema (api-viewer/apidata.js) for the PVE release the live test runs against: 9.2.13.
git_source https://git.proxmox.com/git/pve-docs.git git.proxmox.com/pve-docs b423460
# taslabs-net/homeflare-kit is no longer public; its published tarballs carry the ported source.
npm_source @homeflare/alchemy 0.55.0 'sha512-UsO8HNQKanQRf71OnvMuCfG5rBx1XCRiAsnK2Y0DU3qbPK8jSOv8Pwu//h2RqHVmonSp/rUUe21kpKqU68U19Q=='
npm_source @homeflare/distilled-proxmox "$(pin @distilled.cloud/proxmox)" 'sha512-wcw8lLpwqHxD/FZJxq0HCHhL3uKYlUxvuEB3C9b232RgXZpAwkKY8sMQjV1mVgoT5XwN22qrz7bfhi102F61XA=='
printf 'Pinned source mirrors ready. Reference only; never runtime dependencies.\n'
