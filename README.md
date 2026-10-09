# edufinance-api
Vercel-only backend for EduFinance. Holds the Gemini key.
Env vars (Vercel > Settings > Environment Variables):
- GEMINI_API_KEY (required)
- ALLOWED_ORIGINS (e.g. https://yourname.github.io)
- GEMINI_MODEL (optional)
Endpoint: POST /api/gemini

Request body: { summaryData }. Old monthly review sends a plain summary; the Insights AI sends { task, instructions, data, ... } (max 8000 chars).
Response: { advice }.
