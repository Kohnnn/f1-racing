# Export drop zone

Put your ParaView surface CSV for the first McLaren run here.

Recommended filename:

- `car-surface.csv`

Expected columns in that CSV:

- `p`
- `wallShearStress:0`
- `wallShearStress:1`
- `wallShearStress:2`

Then build the website pack with:

```bash
npm run build:openfoam:overlay -- --config pipeline/openfoam/config/mcl39-baseline-15ms.example.json
```
