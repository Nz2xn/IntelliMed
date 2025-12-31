// --- GLOBAL VARIABLES ---
let allPapers = [];
let savedPapers = JSON.parse(localStorage.getItem('savedPapers') || '[]');
let currentPage = 1;
const resultsPerPage = 10;
let isViewingSaved = false;

// --- CONFIG: THE GOLDEN LIST (Verified IDs) ---
const JOURNAL_IDS = [
    "S37879208",   // American Journal of Surgical Pathology
    "S33606366",   // Modern Pathology
    "S14376486",   // Histopathology
    "S139062638",  // Archives of Pathology & Laboratory Medicine
    "S15871148",   // American Journal of Clinical Pathology
    "S4394736614", // The Journal of Pathology
    "S4210224974", // Virchows Archiv
    "S198620474",  // Acta Neuropathologica
    "S92442678",   // Journal of Cutaneous Pathology
    "S126033908",  // Cancer Cytopathology
    "S4210177785", // Journal of Pathology Informatics
    "S203256638",  // Nature Medicine
    "S116900674",  // The Lancet Oncology
    "S63477337",   // Human Pathology
    "S37362813"    // Journal of Clinical Pathology
];

// --- HELPER: Detect Specific Article Type ---
// OpenAlex is generic, so we use the Title to be specific.
function getDetailedType(paper) {
    const title = (paper.title || "").toLowerCase();
    const type = (paper.type || "").toLowerCase();

    if (title.includes("case report") || title.includes("case series")) {
        return "CASE REPORT";
    }
    if (title.includes("systematic review") || title.includes("meta-analysis")) {
        return "SYSTEMATIC REVIEW";
    }
    if (title.includes("review") || type === "review") {
        return "REVIEW ARTICLE";
    }
    if (title.includes("guideline") || title.includes("consensus")) {
        return "GUIDELINE";
    }
    if (title.includes("editorial") || title.includes("commentary")) {
        return "EDITORIAL";
    }
    
    // Default fallback
    return "ORIGINAL ARTICLE";
}

// --- HELPER: Save/Unsave Paper ---
function toggleSave(index) {
    const paper = isViewingSaved ? savedPapers[index] : allPapers[index];
    const existingIndex = savedPapers.findIndex(p => p.id === paper.id);
    
    if (existingIndex >= 0) { savedPapers.splice(existingIndex, 1); } 
    else { savedPapers.push(paper); }
    
    localStorage.setItem('savedPapers', JSON.stringify(savedPapers));
    renderPage(currentPage);
}

// --- HELPER: Copy Citation ---
function copyCitation(index) {
    const paper = isViewingSaved ? savedPapers[index] : allPapers[index];
    const authors = paper.authorships?.map(a => a.author.display_name).slice(0, 3).join(", ") + (paper.authorships?.length > 3 ? " et al." : "");
    const journal = paper.primary_location?.source?.display_name || "Unknown Journal";
    const year = paper.publication_year;
    const title = paper.title;
    const citation = `${authors}. "${title}." ${journal} (${year}).`;
    
    navigator.clipboard.writeText(citation).then(() => { alert("Citation Copied!\n" + citation); });
}

// --- HELPER: Reconstruct Abstract ---
function getAbstract(invertedIndex) {
    if (!invertedIndex) return "Abstract available in full text.";
    let maxIndex = 0;
    Object.values(invertedIndex).forEach(p => p.forEach(pos => { if(pos > maxIndex) maxIndex = pos; }));
    const arr = new Array(maxIndex + 1);
    Object.entries(invertedIndex).forEach(([word, positions]) => { positions.forEach(pos => arr[pos] = word); });
    let text = arr.join(" ");
    if (text.length > 400) return text.substring(0, 400) + "...";
    return text;
}

// --- HELPER: Format Date ---
function formatDate(dateString) {
    if (!dateString) return "Recent";
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

function log(message) {
    const consoleBox = document.getElementById('debug-console');
    consoleBox.style.display = 'block';
    consoleBox.innerHTML += `<div>${message}</div>`;
    consoleBox.scrollTop = consoleBox.scrollHeight;
}

// --- SWITCH MODES ---
function viewSaved() {
    isViewingSaved = true;
    allPapers = []; 
    document.getElementById('results-area').innerHTML = '';
    
    if (savedPapers.length === 0) {
        document.getElementById('results-area').innerHTML = '<div style="text-align:center; padding:20px;">You haven\'t saved any papers yet.</div>';
        document.getElementById('pagination-controls').style.display = 'none';
        return;
    }
    
    log(`Viewing ${savedPapers.length} saved papers.`);
    currentPage = 1;
    renderPage(1);
    document.getElementById('pagination-controls').style.display = 'flex';
}

async function startSearch() {
    isViewingSaved = false;
    const topic = document.getElementById('topic-select').value;
    const resultsArea = document.getElementById('results-area');
    const pagination = document.getElementById('pagination-controls');
    
    resultsArea.innerHTML = '<div style="text-align:center; padding:20px; color:#2563eb;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top:10px">Accessing Premium Journals...</p></div>';
    pagination.style.display = 'none';
    log(`Starting Verified Search for: ${topic}`);

    const currentYear = new Date().getFullYear();

    // 1. CONSTRUCT FILTER
    const sourceFilter = JOURNAL_IDS.join('|');

    // 2. CONSTRUCT URL
    let apiUrl = "";
    const baseFilter = `primary_location.source.id:${sourceFilter},from_publication_date:${currentYear-2}-01-01`;
    const mailto = "mailto=pathology_app_user@example.com";

    if (topic === 'general') {
        apiUrl = `https://api.openalex.org/works?${mailto}&filter=${baseFilter}&per-page=100&sort=publication_date:desc`;
    } 
    else {
        let topicKeywords = "";
        if (topic === 'histopathology') topicKeywords = 'histopathology OR biopsy OR immunohistochemistry';
        else if (topic === 'computational') topicKeywords = '"computational pathology" OR "digital pathology" OR "deep learning"';
        else if (topic === 'molecular') topicKeywords = '"molecular pathology" OR genomics OR biomarker';
        
        apiUrl = `https://api.openalex.org/works?${mailto}&search=${encodeURIComponent(topicKeywords)}&filter=${baseFilter}&per-page=100&sort=publication_date:desc`;
    }

    try {
        log("Contacting OpenAlex...");
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        const data = await response.json();
        allPapers = data.results;

        log(`SUCCESS! Found ${allPapers.length} verified papers.`);

        if (!allPapers || allPapers.length === 0) {
            resultsArea.innerHTML = '<div style="text-align:center;">No recent papers found in these specific journals.</div>';
            return;
        }

        currentPage = 1;
        renderPage(currentPage);
        pagination.style.display = 'flex';

    } catch (error) {
        log(`ERROR: ${error.message}`);
        resultsArea.innerHTML = `<div style="color:red; text-align:center;"><strong>Connection Failed:</strong><br>${error.message}</div>`;
    }
}

function renderPage(page) {
    const resultsArea = document.getElementById('results-area');
    resultsArea.innerHTML = ''; 
    
    const sourceArray = isViewingSaved ? savedPapers : allPapers;
    const start = (page - 1) * resultsPerPage;
    const end = start + resultsPerPage;
    const papersToShow = sourceArray.slice(start, end);
    
    const totalPages = Math.ceil(sourceArray.length / resultsPerPage);
    document.getElementById('page-info').innerText = `Page ${page} of ${totalPages || 1}`;
    document.getElementById('prev-btn').disabled = (page === 1);
    document.getElementById('next-btn').disabled = (page === totalPages || totalPages === 0);

    if(page > 1) document.querySelector('.controls').scrollIntoView({behavior: 'smooth'});

    papersToShow.forEach((paper, index) => {
        const trueIndex = start + index;
        const isSaved = savedPapers.some(p => p.id === paper.id);

        const title = paper.title || "Untitled Paper";
        let link = "#";
        let linkText = "Read Paper";
        if (paper.doi) { link = paper.doi; linkText = "Read via DOI"; }
        else if (paper.primary_location?.landing_page_url) { link = paper.primary_location.landing_page_url; linkText = "Visit Source"; }
        else { link = `https://scholar.google.com/scholar?q=${encodeURIComponent(title)}`; linkText = "Search Scholar"; }

        // --- NEW FEATURES HERE ---
        
        // 1. Get Specific Article Type (Review, Case Report, etc.)
        const specificType = getDetailedType(paper);
        
        // 2. Get Full Journal Name
        // We use the 'source.display_name' which is the official full title.
        const journalName = paper.primary_location?.source?.display_name || "Unknown Journal";

        // Badge Styling based on type
        let typeColor = "#0369a1"; // Default Blue
        let typeBg = "#e0f2fe";
        if (specificType === "CASE REPORT") { typeColor = "#9333ea"; typeBg = "#f3e8ff"; } // Purple
        if (specificType === "REVIEW ARTICLE") { typeColor = "#b45309"; typeBg = "#fef3c7"; } // Orange
        if (specificType === "SYSTEMATIC REVIEW") { typeColor = "#b91c1c"; typeBg = "#fee2e2"; } // Red

        const dateStr = formatDate(paper.publication_date);
        const abstractText = getAbstract(paper.abstract_inverted_index);

        const card = document.createElement('div');
        card.className = 'paper-card';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div class="tags">
                    <span class="tag-type" style="background:${typeBg}; color:${typeColor}; padding:3px 10px; border-radius:15px; font-weight:700; font-size:0.7rem; border:1px solid ${typeColor}20;">${specificType}</span>
                    <span class="tag-level" style="background:#f0fdf4; color:#15803d; padding:3px 10px; border-radius:15px; font-weight:600; font-size:0.7rem;">${dateStr}</span>
                </div>
                <div>
                    <button onclick="copyCitation(${trueIndex})" style="background:none; border:none; cursor:pointer; font-size:1.1rem; color:#64748b; margin-right:10px;" title="Copy Citation">
                        <i class="fa-regular fa-copy"></i>
                    </button>
                    <button onclick="toggleSave(${trueIndex})" style="background:none; border:none; cursor:pointer; font-size:1.1rem; color:${isSaved ? '#eab308' : '#cbd5e1'};" title="Save to Library">
                        <i class="${isSaved ? 'fa-solid' : 'fa-regular'} fa-star"></i>
                    </button>
                </div>
            </div>

            <h3 class="paper-title" style="margin-top:12px;">
                <a href="${link}" target="_blank">${title}</a>
            </h3>

            <div style="margin-bottom:12px; display:flex; align-items:center;">
                <span style="color:#334155; background:#f1f5f9; padding:6px 12px; border-radius:6px; font-size:0.9rem; font-weight:600; display:flex; align-items:center; gap:8px;">
                    <i class="fa-solid fa-book-medical" style="color:#2563eb;"></i> ${journalName}
                </span>
            </div>
            
            <p class="paper-abstract" style="background:#fafafa; padding:15px; border-radius:6px; font-size:0.95rem; color:#444; line-height:1.6; border-left:4px solid #cbd5e1;">
                <strong>Abstract:</strong> ${abstractText}
            </p>
            
            <div style="margin-top:15px; padding-top:10px; display:flex; justify-content:flex-end;">
                <a href="${link}" target="_blank" class="telegram-btn">${linkText} <i class="fa-solid fa-arrow-up-right-from-square" style="margin-left:8px;"></i></a>
            </div>
        `;
        resultsArea.appendChild(card);
    });
}

function changePage(direction) {
    currentPage += direction;
    renderPage(currentPage);
}