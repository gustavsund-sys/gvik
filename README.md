# Gustavsvik Flyover

Interaktiv 3D-banguide för Gustavsviksbanan på Örebro City Golf & Country Club.

## Teknik

- CesiumJS för 3D-kartan.
- Lantmäteriets ortofoto och lokala höjdmodell som statiska kartresurser.
- Cloud Firestore för den gemensamma bankonfigurationen i `courses/gustavsvik`.
- `dist/editor-defaults.json` används som reserv om Firestore inte kan nås.

## Lokal körning

```bash
python3 -m http.server 4174 --directory dist
```

Öppna `http://127.0.0.1:4174/`.

## Firebase

Projekt: `gvik-3d311`. Databasregion: `europe-north1`.

```bash
firebase deploy --only firestore --project gvik-3d311
```

Firestore är publik för läsning av `courses/gustavsvik`. Klientskrivning är blockerad. Kartbyggarens lokala lösenord är inte en säker autentiseringsmetod för databasåtkomst.
