// utils.js

// 1. Detect Article Type (Review, Case Report, etc.)
export function getDetailedType(paper) {
    const title = (paper.title || "").toLowerCase();
    const type = (paper.type || "").toLowerCase();

    if (title.includes("case report") || title.includes("case series")) return "CASE REPORT";
    if (title.includes("systematic review") || title.includes("meta-analysis")) return "SYSTEMATIC REVIEW";
    if (title.includes("review") || type === "review") return "REVIEW ARTICLE";
    if (title.includes("guideline") || title.includes("consensus")) return "GUIDELINE";
    if (title.includes("editorial")) return "EDITORIAL";
    return "ORIGINAL ARTICLE";
}

// 2. Reconstruct Abstract from OpenAlex Inverted Index
export function getAbstract(invertedIndex) {
    if (!invertedIndex) return "Abstract available in full text.";
    let maxIndex = 0;
    Object.values(invertedIndex).forEach(p => p.forEach(pos => { if(pos > maxIndex) maxIndex = pos; }));
    const arr = new Array(maxIndex + 1);
    Object.entries(invertedIndex).forEach(([word, positions]) => { positions.forEach(pos => arr[pos] = word); });
    let text = arr.join(" ");
    if (text.length > 400) return text.substring(0, 400) + "...";
    return text;
}

// 3. Format Date
export function formatDate(dateString) {
    if (!dateString) return "Recent";
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

// 4. Generate Citation Text
export function generateCitation(paper) {
    const authors = paper.authorships?.map(a => a.author.display_name).slice(0, 3).join(", ") + (paper.authorships?.length > 3 ? " et al." : "");
    const journal = paper.primary_location?.source?.display_name || "Unknown Journal";
    const year = paper.publication_year;
    const title = paper.title;
    return `${authors}. "${title}." ${journal} (${year}).`;
}

// 5. Share Paper Logic
export async function sharePaper(paper) {
    const title = paper.title || "Pathology Paper";
    const url = paper.doi || paper.primary_location?.landing_page_url || window.location.href;
    const text = `Check out this paper: "${title}"`;

    // Try to use the native phone/browser share menu
    if (navigator.share) {
        try {
            await navigator.share({
                title: "IntelliMed Paper",
                text: text,
                url: url
            });
        } catch (err) {
            // User cancelled share, do nothing
            console.log("Share cancelled");
        }
    } else {
        // Fallback for desktops: Copy to clipboard
        navigator.clipboard.writeText(`${text}\n${url}`).then(() => {
            alert("Link copied to clipboard!");
        });
    }
}
// Analyze Abstract for Study "DNA" ---
export function analyzeStudyFeatures(abstract) {
    const text = (abstract || "").toLowerCase();
    const features = [];

    // 1. SUBJECTS (Human vs Model)
    if (text.includes("patient") || text.includes("clinical") || text.includes("cohort")) {
        features.push({ icon: "fa-user-doctor", label: "Human Study", color: "#3b82f6" }); // Blue
    } else if (text.includes("mice") || text.includes("murine") || text.includes("xenograft") || text.includes("cell line")) {
        features.push({ icon: "fa-flask", label: "Exp. Model", color: "#8b5cf6" }); // Purple
    }

    // 2. TECHNIQUE (Morphology vs Molecular vs AI)
    if (text.includes("deep learning") || text.includes("artificial intelligence") || text.includes("cnn") || text.includes("algorithm")) {
        features.push({ icon: "fa-microchip", label: "AI / Digital", color: "#ef4444" }); // Red
    } else if (text.includes("sequencing") || text.includes("ngs") || text.includes("pcr") || text.includes("mutation")) {
        features.push({ icon: "fa-dna", label: "Molecular", color: "#10b981" }); // Green
    } else if (text.includes("immunohistochemistry") || text.includes("staining") || text.includes("histologic")) {
        features.push({ icon: "fa-microscope", label: "Histology", color: "#f59e0b" }); // Orange
    }

    // 3. STUDY TYPE (Review vs Case vs Trial)
    if (text.includes("review") || text.includes("meta-analysis")) {
        features.push({ icon: "fa-book-open", label: "Review", color: "#64748b" }); // Gray
    } else if (text.includes("case report")) {
        features.push({ icon: "fa-file-medical", label: "Case Report", color: "#64748b" });
    }

    return features;
}

// --- Highlight Search Terms ---
export function highlightTerms(text, query) {
    if (!query || !text) return text;

    // Clean the query: split by space, remove short words like "the", "and"
    const terms = query.split(/\s+/)
        .map(w => w.replace(/[^a-zA-Z0-9]/g, '')) // Remove punctuation
        .filter(w => w.length > 2); // Ignore short words

    if (terms.length === 0) return text;

    // Create a regular expression for all terms (case insensitive)
    const regex = new RegExp(`(${terms.join('|')})`, 'gi');

    // Wrap matches in a <mark> tag
    return text.replace(regex, '<mark>$1</mark>');
}