# Kontakty LL – Kdo je kdo

Webová stránka s kontakty Libeřských lahůdek (náhrada stránky Kontakty v intranetu).
Běží na GitHub Pages: https://liberskelahudky.github.io/kontakty/

## Soubory
- `index.html` – stránka (vzhled a logika)
- `data.json` – všechny kontakty, oddělení a témata „Co potřebujete vyřešit?“
- `fotky/` – fotky lidí (nahrávají se ze stránky)

## Úpravy
1. Na stránce klepnout na tužku a zadat PIN.
2. Upravit, co je potřeba, a dát **Uložit**.
3. Na každém zařízení je napoprvé potřeba zadat GitHub token (pak si ho prohlížeč pamatuje).

Kolegové uvidí změny zhruba do minuty (GitHub Pages se musí přegenerovat).

## GitHub token pro ukládání
Fine-grained token: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token
- Resource owner: **liberskelahudky**
- Repository access: **Only select repositories → kontakty**
- Permissions → Repository permissions → **Contents: Read and write**
