# Gustavsvik Flyover

Interaktiv 3D-banguide för Gustavsviksbanan på Örebro City Golf & Country Club.

## Teknik

- CesiumJS för 3D-kartan.
- Lantmäteriets ortofoto och lokala höjdmodell som statiska kartresurser.
- Cloud Firestore för den gemensamma bankonfigurationen i `courses/gustavsvik`.
- `dist/editor-defaults.json` används som reserv om Firestore inte kan nås.
- Ett fristående 3D-objektsystem med ett generellt assetregister, små GLB-modeller och reproducerbara vegetationssektioner.

## 3D-objekt

Kartbyggarens kategori **3D-objekt / Vegetation** sparar data i de valfria fälten `objects3d` och `vegetationSections`. Befintlig bankonfiguration påverkas inte om fälten saknas eller är tomma. Vegetationssektionerna använder ett sparat random seed, så samma objekt återskapas efter omladdning.

Modellregistret finns i `dist/object-builder.js`. Nya typer läggs till där med modellvarianter, standardhöjd och maximalt visningsavstånd. De medföljande lågpolymodellerna kan genereras om med:

```bash
python3 scripts/generate_object_models.py
```

Rökprovet för placering, sektioner, deterministisk omrendering och beständig data körs med:

```bash
node scripts/test_object_builder.mjs
```

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

Firestore är publik för läsning av `courses/gustavsvik`. Skrivning kräver Firebase Authentication med e-post/lösenord och den uttryckligen tillåtna byggarens UID.
