#!/bin/bash
# ============================================================================
#  پشتیبان روزانهٔ داده‌های پاسور ۱۱
#  ----------------------------------------------------------------------------
#  هر شب یک نسخهٔ فشرده از data.json می‌گیرد و ۱۴ روز اخیر را نگه می‌دارد.
#  با cron اجرا می‌شود؛ دستی هم می‌توانی بزنی:  bash /opt/pasur11/backup.sh
# ============================================================================
set -u

DATA="${DATA_FILE:-/opt/pasur11/data.json}"
DIR="$(dirname "$DATA")/backups"
KEEP=14

mkdir -p "$DIR" || exit 1

if [ ! -s "$DATA" ]; then
  echo "$(date '+%F %T') — فایل داده پیدا نشد یا خالی است: $DATA"
  exit 0
fi

# بررسی سالم‌بودن JSON پیش از پشتیبان‌گیری (از نسخهٔ خراب پشتیبان نگیریم)
if command -v node >/dev/null 2>&1; then
  if ! node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$DATA" 2>/dev/null; then
    echo "$(date '+%F %T') — ⚠️ فایل داده خراب است؛ پشتیبان گرفته نشد"
    exit 1
  fi
fi

STAMP="$(date '+%Y-%m-%d')"
OUT="$DIR/data-$STAMP.json.gz"

if gzip -c "$DATA" > "$OUT.tmp" && mv "$OUT.tmp" "$OUT"; then
  SIZE="$(du -h "$OUT" | cut -f1)"
  echo "$(date '+%F %T') — ✅ پشتیبان گرفته شد: $OUT ($SIZE)"
else
  rm -f "$OUT.tmp"
  echo "$(date '+%F %T') — ❌ پشتیبان‌گیری ناموفق بود"
  exit 1
fi

# نگه‌داشتن فقط ۱۴ نسخهٔ آخر
ls -1t "$DIR"/data-*.json.gz 2>/dev/null | tail -n "+$((KEEP+1))" | while read -r f; do
  rm -f "$f" && echo "$(date '+%F %T') — نسخهٔ قدیمی پاک شد: $(basename "$f")"
done

exit 0
