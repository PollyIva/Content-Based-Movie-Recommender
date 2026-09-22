// ============================================================================
// data.js — Data loading & parsing module
// Responsibilities: fetch u.item and u.data, parse them, and store the result
// in the global `movies` and `ratings` arrays. No UI or recommendation logic.
// ============================================================================

// Global containers filled by the parsing functions below
let movies = [];
let ratings = [];

// itemId -> number of ratings it received, used for the long-tail analysis
let ratingsCount = new Map();

// The 19 genre dimensions stored in each u.item line (dimension 0 is "unknown")
const GENRE_DIMENSIONS = [
    "unknown", "Action", "Adventure", "Animation", "Children's", "Comedy",
    "Crime", "Documentary", "Drama", "Fantasy", "Film-Noir",
    "Horror", "Musical", "Mystery", "Romance", "Sci-Fi",
    "Thriller", "War", "Western"
];

// --------------------------------------------------------------------------
// loadData()
// Fetches both data files. Must be awaited before using movies/ratings.
// Errors are surfaced in the #result paragraph.
// --------------------------------------------------------------------------
async function loadData() {
    try {
        // 1) Load and parse movie data (u.item)
        // u.item is encoded in Latin-1 (ISO-8859-1), so we cannot rely on
        // response.text(), which decodes as UTF-8 and garbles accented
        // characters (e.g. "Café", "Véronique"). Decode the raw bytes explicitly.
        const moviesResponse = await fetch('u.item');
        if (!moviesResponse.ok) {
            throw new Error(`Failed to load movie data (${moviesResponse.status})`);
        }
        const moviesText = new TextDecoder('latin1').decode(await moviesResponse.arrayBuffer());
        parseItemData(moviesText);

        // 2) Load and parse rating data (u.data) — pure ASCII, but decode the
        // same way for consistency
        const ratingsResponse = await fetch('u.data');
        if (!ratingsResponse.ok) {
            throw new Error(`Failed to load rating data (${ratingsResponse.status})`);
        }
        const ratingsText = new TextDecoder('latin1').decode(await ratingsResponse.arrayBuffer());
        parseRatingData(ratingsText);
    } catch (error) {
        console.error('Error loading data:', error);
        const resultElement = document.getElementById('result');
        if (resultElement) {
            const statusElement = document.getElementById('status');
            if (statusElement) {
                statusElement.textContent =
                    `Error: ${error.message}. Make sure u.item and u.data are in the same folder as index.html.`;
                statusElement.className = 'status error';
            } else {
                resultElement.textContent = `Error: ${error.message}`;
            }
        }
        throw error; // re-throw so script.js knows initialization failed
    }
}

// --------------------------------------------------------------------------
// parseItemData(text)
// Each u.item line: id|title|releaseDate|videoDate|url|19 genre flags
// Field 0 = id, field 1 = title, fields 5..23 = genre booleans.
// --------------------------------------------------------------------------
function parseItemData(text) {
    const lines = text.split('\n');

    for (const line of lines) {
        if (line.trim() === '') continue;

        const fields = line.split('|');
        if (fields.length < 24) continue; // need id, title and all 19 genre flags

        const id = parseInt(fields[0]);
        const title = fields[1];

        // 19-dimensional genre vector: vector[0] = "unknown", vector[1] = "Action", ...
        const vector = fields.slice(5, 24).map(value => parseInt(value));

        // Names of the genres present for this movie (skipping the "unknown" slot)
        const genres = GENRE_DIMENSIONS.slice(1).filter((_, i) => vector[i + 1] === 1);

        movies.push({ id, title, genres, vector });
    }
}

// --------------------------------------------------------------------------
// parseRatingData(text)
// Each u.data line: userID\titemID\trating\ttimestamp
// --------------------------------------------------------------------------
function parseRatingData(text) {
    const lines = text.split('\n');

    for (const line of lines) {
        if (line.trim() === '') continue;

        const fields = line.split('\t');
        if (fields.length < 4) continue;

        const userId = parseInt(fields[0]);
        const itemId = parseInt(fields[1]);

        ratings.push({
            userId: userId,
            itemId: itemId,
            rating: parseFloat(fields[2]),
            timestamp: parseInt(fields[3])
        });

        // Count ratings per movie while parsing
        ratingsCount.set(itemId, (ratingsCount.get(itemId) || 0) + 1);
    }
}