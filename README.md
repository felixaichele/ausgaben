# Ausgaben

Kleine Web-App, mit der du Ausgaben direkt am Handy einträgst, statt sie in Notizen zu sammeln.

**App öffnen:** https://felixaichele.github.io/ausgaben/

## Aufs Handy holen

- **iPhone (Safari):** Seite öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.
- **Android (Chrome):** Seite öffnen → Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.

Danach immer über das Icon öffnen. Die Einträge werden in genau dieser App auf dem Gerät gespeichert (nicht im Repository, nicht im Internet).

## Bedienung

- **Eintragen:** Betrag, Kategorie (Kochen, Essen bestellt, BIBI, Sonstiges, Einnahme), optional Notiz und Datum. Bei BIBI und Sonstiges kannst du „aus Rücklage bezahlt“ anhaken – das entspricht der Spalte „real – RL“ in der Excel.
- **Eintrag ändern/löschen:** in der Liste antippen.
- **Übersicht:** Kennzahlen, Budgets, Monatsverlauf, Ausgaben pro Tag, größte Posten.
- **Einstellungen** (unten in der Übersicht): Grundkosten, Budgets, Essen-Ziel pro Tag.

## Monatsabschluss

1. In der Übersicht **„Für Excel kopieren“** tippen (oder am Laptop die CSV herunterladen).
2. In der Excel-Kostenkontrolle das neue Monatsblatt öffnen, **Zelle C2** anklicken und einfügen. Die Werte landen in den Spalten C–N.
3. Danach **„Einträge dieses Monats löschen“** – erst dann aktiv, wenn exportiert wurde.

## Datensicherung

Da die Daten nur auf dem Gerät liegen: in den Einstellungen ab und zu **„Backup speichern“** (JSON-Datei, z. B. in iCloud/Drive ablegen). Mit **„Backup einspielen“** holst du sie zurück, etwa auf ein neues Handy.

## Technik

Reines HTML/CSS/JavaScript ohne externe Abhängigkeiten, offline-fähig (Service Worker). Nach Änderungen an den Dateien in `sw.js` die `VERSION` erhöhen, damit die App die neue Fassung lädt.
