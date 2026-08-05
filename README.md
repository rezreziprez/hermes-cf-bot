# 🤖 Hermes CF Bot

بات تلگرام هوش مصنوعی روی Cloudflare Workers (رایگان + بدون محدودیت Volume!)

## ✨ ویژگی‌ها

- 💬 چت با هوش مصنوعی (OpenAI, 9router, و هر API سازگار)
- 💾 ذخیره تاریخچه مکالمات روی D1 (SQLite کلادفلر)
- ⚙️ تنظیم سیستم پرامپت برای هر کاربر
- 🗂️ پاک کردن تاریخچه
- 🛠️ تغییر مدل
- 🔧 بدون محدودیت دیسک!

## 📦 نصب

### ۱. کلون پروژه
```bash
git clone https://github.com/rezreziprez/hermes-cf-bot.git
cd hermes-cf-bot
npm install
```

### ۲. ساخت D1 Database
```bash
wrangler d1 create hermes-db
```
خروجی یه `database_id` میده. اون رو توی `wrangler.toml` بذار.

### ۳. ساخت KV Namespace
```bash
wrangler kv:namespace create HERMES_KV
```
خروجی یه `id` میده. اون رو توی `wrangler.toml` بذار.

### ۴. ایجاد جداول D1
```bash
wrangler d1 execute hermes-db --file=./schema.sql
```

### ۵. تنظیم متغیرهای محیطی
توی `wrangler.toml`:
```toml
[vars]
TELEGRAM_BOT_TOKEN = "توکن بات تلگرام"
OPENAI_API_KEY = "کلید API"
OPENAI_BASE_URL = "https://9router-production-d4c69.up.railway.app/v1"
MODEL_NAME = "gpt-4o-mini"
SYSTEM_PROMPT = "تو یه دستیار هوش مصنوعی کمک‌حال هستی."
```

### ۶. دیپلوی
```bash
wrangler deploy
```

### ۷. تنظیم وب‌هوک
مرورگر برو به:
```
https://your-worker.workers.dev/setup-webhook
```

## 🛠️ دستورات

| دستور | توضیح |
|-------|-------|
| `/start` | شروع و راهنما |
| `/clear` | پاک کردن تاریخچه |
| `/system [متن]` | تنظیم سیستم پرامپت |
| `/model [نام]` | تغییر مدل |
| `/settings` | نمایش تنظیمات فعلی |

## 💰 هزینه

- **Workers**: ۱۰۰,۰۰۰ درخواست/روز رایگان
- **D1**: ۵GB ذخیره‌سازی رایگان
- **KV**: ۱GB ذخیره‌سازی رایگان

## 🔧 توسعه محلی

```bash
npm run dev
```

سپس توی ترمینال دیگه:
```bash
ngrok http 8787
```
وب‌هوک تلگرام رو به URL نگرک تنظیم کن.

## 📁 ساختار پروژه

```
cloudflare-bot/
├── src/
│   ├── index.ts      # ورودی Worker
│   ├── types.ts      # تایپ‌ها
│   ├── telegram.ts   # هندلر تلگرام
│   ├── ai.ts         # اتصال AI
│   └── db.ts         # توابع D1
├── schema.sql        # ساختار دیتابیس
├── wrangler.toml     # تنظیمات Cloudflare
└── package.json
```

## 🌐 دیپلوی روی حساب خودت

```bash
# فورک کن
gh repo fork rezreziprez/hermes-cf-bot

# کلون کن
git clone https://github.com/YOUR_USERNAME/hermes-cf-bot.git
cd hermes-cf-bot

# نصب و تنظیم
npm install
# wrangler.toml رو ویرایش کن

# دیپلوی
wrangler deploy
```

## ❤️ ساخته شده با

- Cloudflare Workers
- Cloudflare D1
- TypeScript
- OpenAI API
