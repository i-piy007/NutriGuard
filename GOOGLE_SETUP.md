# Raw Ingredients Feature - Google Images Setup (Optional)

The raw ingredients feature will work without Google API, but adding it will fetch actual dish images.

## Setup Google Custom Search API (Optional)

### 1. Get Google API Key
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable "Custom Search API"
4. Go to "Credentials" → "Create Credentials" → "API Key"
5. Copy your API key

### 2. Create Custom Search Engine
1. Go to [Programmable Search Engine](https://programmablesearchengine.google.com/)
2. Click "Add" to create new search engine
3. In "Sites to search": Enter `*` (to search the entire web)
4. Enable "Image search" and "Search the entire web"
5. Click "Create"
6. Copy your "Search engine ID" (CX)

### 3. Add to Environment Variables

In your backend, add these environment variables:

```bash
# .env or set in your hosting platform
GOOGLE_API_KEY=your_api_key_here
GOOGLE_CX=your_search_engine_id_here
```

For Render.com (your current backend):
1. Go to your service dashboard
2. Environment → Add Environment Variable
3. Add `GOOGLE_API_KEY` and `GOOGLE_CX`
4. Redeploy

## Without Google API

If you don't set up Google API, the feature will still work:
- Ingredients will be detected
- Dishes will be suggested
- Images will just not be shown (gracefully handled in UI)

## Testing

After setup:
1. Tap "Raw Ingredients" on dashboard
2. Take photo of raw ingredients
3. View:
   - ✅ List of detected ingredients (chips)
   - ✅ Suggested dishes with descriptions
   - ✅ Dish images (if Google API configured)
   - ✅ "Scan Again" and "Home" buttons
