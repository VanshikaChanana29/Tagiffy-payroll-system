# Certificate signatures

Director signatures and the optional company stamp for the Employee of the
Month certificate are **uploaded in the app**: Employee of the Month →
Certificate signatures. Uploads go to file storage (Cloudflare R2 in
production), so they work on the live site and never enter this repository,
which is public.

This folder is only a local-development fallback. A `<slot>.png` here is used
when nothing has been uploaded for that slot:

- `rohit-goyal.png`: Mr. Rohit Goyal
- `himanshu-jindal.png`: Mr. Himanshu Jindal
- `sajal-jain.png`: Mr. Sajal Jain
- `rohit-goel.png`: Mr. Rohit Goel
- `company-stamp.png`: company stamp / seal (optional)

Images here are git-ignored; do not commit real signatures. The list of
signatories lives in `src/utils/certificatePdf.js`.
