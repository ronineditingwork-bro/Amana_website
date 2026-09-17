# Imagery

Every file in this folder is **procedurally generated** by
`tools/generate_imagery.py` — architectural light studies, material macros and
product studio plates, all finished through one shared grade so the set reads as
a single photographic system.

They are stand-ins for the brand's own photography, not stock photos: no
third-party image is used anywhere in this repository.

## Replacing them with real photography

Drop a real photograph over any file, keep the filename and roughly the aspect
ratio, and nothing in the CSS or markup needs to change. Update the `width` and
`height` attributes on the corresponding `<img>` if the ratio differs.

| File | Ratio | Used for |
| --- | --- | --- |
| `hero.jpg` | 16:9 | Home hero, edge-to-edge |
| `hero-portrait.jpg` | 3:4 | Reserved for a portrait hero crop |
| `collection-*.jpg` | 4:5 / 16:9 / 1:1 | Collection features |
| `project-0*.jpg` | 4:5 / 16:9 | Project gallery and bleeds |
| `inspiration-0*.jpg` | 4:5 / 4:3 | Journal cards |
| `material-*.jpg` | 3:2 | Finish swatches (Brushed Steel, Graphite PVD, Burnished Bronze, Stone Grain) |
| `technology-0*.jpg` | 16:9 / 4:5 / 4:3 | Technology macros |
| `sustainability.jpg` | 16:9 | Water surface |
| `contact.jpg` | 5:3 | Contact page bleed |
| `product-*.jpg` | 4:5 | Catalog and product cards, on a light ground |

## Regenerating

```bash
pip install numpy pillow
python3 tools/generate_imagery.py          # full size, ~2 min
python3 tools/generate_imagery.py --fast   # half size, for quick iteration
```
