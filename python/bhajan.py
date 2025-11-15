import re
import json

# --- Configuration: adjust if needed ---
STARTING_ID = 1
ENGLISH_STOPWORDS = {
    "the","is","a","an","and","or","to","of","in","that","this","who","which",
    "we","you","he","she","it","they","them","their","our","for","with","on",
    "by","as","at","from","be","are","was","were","have","has","had","do","did",
    "does","will","would","can","could","may","might","shall","should","not",
    "but","so","if","when","where","how","what","why","your","our","i","me",
    "my","his","her","its","these","those","also","please","sing","singing",
    "today","present","who","bring","bring","please","victory","victory","lord"
}

# regex to detect Devanagari
DEVANAGARI_RE = re.compile(r'[\u0900-\u097F]')

def split_bhajans(text):
    """
    Split by numbered markers like:
      1A.  or  29.  or  5A.  etc.
    Keeps any trailing content with each segment.
    """
    # Ensure the document starts with a marker: if not, we still want one segment.
    # Use re.split on lines that start with optional whitespace then digits+optional letters then dot
    parts = re.split(r'(?m)^\s*\d+\w*\.\s*', text)
    # The first element may be preamble/empty if text started with a number — remove empties
    parts = [p.strip() for p in parts if p.strip()]
    return parts

def looks_like_english_translation(line):
    """
    Heuristic: consider a line 'English' (translation) when
    - it has >1 English stopword occurrence relative to number of words, OR
    - it contains many common English punctuation patterns and multiple words
    """
    s = line.strip()
    if not s:
        return True

    # If line contains Devanagari, it's definitely NOT an English translation (it's a lyric)
    if DEVANAGARI_RE.search(s):
        return False

    # If the line has non-letter characters only (e.g. separators), treat as not lyric
    if re.fullmatch(r'[_\-=\s\|]+', s):
        return True

    # Count words and stopwords
    words = re.findall(r"[A-Za-z']+", s)  # only Latin words
    if not words:
        # No latin words (maybe punctuation) — treat as non-lyric
        return True

    stop_count = sum(1 for w in words if w.lower() in ENGLISH_STOPWORDS)

    # fraction of stopwords
    frac = stop_count / len(words)

    # If line is fairly long (>6 words) and many stopwords, it's likely a translation/explanation
    if len(words) >= 6 and frac >= 0.25:
        return True

    # If line contains typical English multi-word phrases with punctuation (e.g., semicolon) and some stopwords:
    if (';' in s or ',' in s or '.' in s) and stop_count >= 2:
        return True

    # Otherwise treat as lyric (transliteration) — keep it
    return False

def clean_bhajan(raw_text_segment):
    """
    From a single bhajan segment (text block), return cleaned lines (lyrics only).
    """
    lines = raw_text_segment.splitlines()
    cleaned = []
    for line in lines:
        # remove leading numbering remnants like "29" or lines that are just numbers
        if re.fullmatch(r'\s*\d+\s*', line):
            continue
        # remove long separators or underscores
        if re.fullmatch(r'\s*[_\-\=]{3,}\s*', line):
            continue

        # normalize whitespace
        line = re.sub(r'\s+', ' ', line).strip()

        if not line:
            continue

        # remove any inline headings like "29" at EOL
        line = re.sub(r'\s+\d+\s*$', '', line).strip()

        # Skip lines that look like English translations
        if looks_like_english_translation(line):
            continue

        # Skip lines that are purely punctuation or separators
        if re.fullmatch(r'^[\W_]+$', line):
            continue

        cleaned.append(line)

    # Further post-processing: remove leading/trailing empty and dedupe adjacent duplicates
    final_lines = []
    prev = None
    for l in cleaned:
        if l == prev:
            prev = l
            continue
        final_lines.append(l)
        prev = l

    return final_lines

def bhajans_to_json(raw_text, starting_id=STARTING_ID):
    parts = split_bhajans(raw_text)
    out = []
    bh_id = starting_id
    for seg in parts:
        cleaned_lines = clean_bhajan(seg)
        if not cleaned_lines:
            continue
        name = cleaned_lines[0]
        lyrics = "\\n".join(cleaned_lines)
        out.append({
            "id": bh_id,
            "name": name,
            "lyrics": lyrics
        })
        bh_id += 1
    return out

if __name__ == "__main__":
    # usage: put your raw text into bhajans_raw.txt
    with open("bhajans_raw.txt", "r", encoding="utf-8") as f:
        raw = f.read()

    json_arr = bhajans_to_json(raw, starting_id=1)
    with open("bhajans_cleaned.json", "w", encoding="utf-8") as f:
        json.dump(json_arr, f, ensure_ascii=False, indent=2)

    print(f"Processed {len(json_arr)} bhajans -> bhajans_cleaned.json")
