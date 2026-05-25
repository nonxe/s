# AS Social Feed (Cloudflare Workers)

Workers.dev-ready social feed where:
- user media uploads are proxied to `https://apis.davidcyril.name.ng/uploader/catbox`
- your server stores only metadata + approved feed entries in Cloudflare KV
- admin approval controls what appears in the feed
- admin profile name is `AS` with verified tick

## Setup
1. Create KV namespace and replace `wrangler.toml` ids.
2. Deploy:
   ```bash
   wrangler deploy
   ```

## API
- `POST /api/upload` form-data (`file` or `url`) → `{ mediaUrl }`
- `GET /api/feed` approved posts
- `POST /api/comments` add comment (`adminPass: "as123"` makes verified admin comment)
- `POST /api/admin/post` admin-only direct post
- `GET /api/admin/pending?pass=as123` pending list
- `POST /api/admin/approve` approve post

## Note
Admin password is currently hardcoded as requested (`as123`); for production, move it to Worker secrets.
