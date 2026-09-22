// ============================================================================
// data.js — Data loading & parsing module
// Responsibilities: fetch u.item and u.data, parse them, and store the result
// in the global `movies` and `ratings` arrays. No UI or recommendation logic.
// ============================================================================

// Global containers filled by the parsing functions below
let movies = [];
let ratings = [];

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
        const moviesResponse = await fetch('u.item');
        if (!moviesResponse.ok) {
            throw new Error(`Failed to load movie data (${moviesResponse.status})`);
        }
        const moviesText = await moviesResponse.text();
        parseItemData(moviesText);

        // 2) Load and parse rating data (u.data)
        const ratingsResponse = await fetch('u.data');
        if (!ratingsResponse.ok) {
            throw new Error(`Failed to load rating data (${ratingsResponse.status})`);
        }
        const ratingsText = await ratingsResponse.text();
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

        ratings.push({
            userId: parseInt(fields[0]),
            itemId: parseInt(fields[1]),
            rating: parseFloat(fields[2]),
            timestamp: parseInt(fields[3])
        });
    }
}