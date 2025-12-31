// static/js/api.js
import { JOURNAL_IDS, SETTINGS } from './config.js';

// --- HELPER: Generate Query from Dropdowns ---
function getSearchQuery() {
    const category = document.getElementById('category-select').value;
    const subtopic = document.getElementById('subtopic-select').value;
    let keywords = "";

    switch (subtopic) {
        // --- SURGICAL ---
        case "general": keywords = 'pathology OR diagnostic OR tumor OR biopsy'; break;
        case "gastrointestinal": keywords = '"gastrointestinal pathology" OR colon OR gastric OR liver OR pancreas OR colitis OR "GI tract"'; break;
        case "breast": keywords = '"breast pathology" OR carcinoma OR "ductal carcinoma" OR her2 OR "lobular carcinoma" OR "triple negative"'; break;
        case "gynecologic": keywords = '"gynecologic pathology" OR ovarian OR endometrial OR cervical OR uterus OR vulvar'; break;
        case "dermatopathology": keywords = 'dermatopathology OR melanoma OR "squamous cell" OR "basal cell" OR nevus OR skin'; break;
        case "genitourinary": keywords = '"genitourinary pathology" OR renal OR kidney OR prostate OR bladder OR urothelial'; break;
        case "neuropathology": keywords = 'neuropathology OR glioblastoma OR astrocytoma OR brain OR "CNS tumor"'; break;
        case "soft_tissue": keywords = '"soft tissue" OR sarcoma OR bone OR osteosarcoma OR lipoma'; break;
        case "head_neck": keywords = '"head and neck" OR thyroid OR salivary OR laryngeal OR oral OR pharynx'; break;

        // --- CYTO ---
        case "general_cyto": keywords = 'cytopathology OR cytology OR smear'; break;
        case "fna": keywords = '"fine needle aspiration" OR FNA OR biopsy OR needle'; break;
        case "gyn_cyto": keywords = '"pap smear" OR cervical OR bethesda OR "HPV"'; break;
        case "fluids": keywords = 'effusion OR ascites OR pleural OR peritoneal OR fluid'; break;

        // --- HEME ---
        case "lymphoma": keywords = 'lymphoma OR "hodgkin" OR "diffuse large B-cell" OR lymphadenopathy'; break;
        case "leukemia": keywords = 'leukemia OR "bone marrow" OR myeloid OR lymphoid OR acute'; break;
        case "coagulation": keywords = 'coagulation OR hemostasis OR thrombosis OR bleeding'; break;

        // --- MOLECULAR ---
        case "biomarkers": keywords = 'biomarker OR pd-l1 OR her2 OR msi OR "tumor burden"'; break;
        case "ngs": keywords = '"next generation sequencing" OR NGS OR sequencing OR mutation'; break;
        case "genetics": keywords = 'cytogenetics OR FISH OR karyotype OR translocation'; break;

        // --- COMP ---
        case "ai_diagnosis": keywords = '"artificial intelligence" OR "deep learning" OR CNN OR algorithm'; break;
        case "wsi": keywords = '"whole slide imaging" OR WSI OR digital OR scanner'; break;
        case "prognosis_ai": keywords = 'prognosis OR prediction OR survival OR "risk stratification"'; break;

        default: keywords = 'pathology OR diagnostic'; break;
    }
    return keywords;
}

// --- 1. GET PAPERS (List) ---
export async function fetchPapers() {
    const keywords = getSearchQuery();
    const currentYear = new Date().getFullYear();
    const sourceFilter = JOURNAL_IDS.join('|');
    // For the LIST, we only look back 2 years to keep it fresh
    const baseFilter = `primary_location.source.id:${sourceFilter},from_publication_date:${currentYear-2}-01-01`;
    const mailto = `mailto=${SETTINGS.contactEmail}`;

    const apiUrl = `${SETTINGS.apiBaseUrl}?${mailto}&search=${encodeURIComponent(keywords)}&filter=${baseFilter}&per-page=100&sort=publication_date:desc`;

    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data = await response.json();
    return data.results;
}

// --- 2. GET TRENDS (Chart) ---
export async function fetchTrendData() {
    const keywords = getSearchQuery();
    const currentYear = new Date().getFullYear();
    const sourceFilter = JOURNAL_IDS.join('|');
    
    // For the CHART, we look back 10 years
    const baseFilter = `primary_location.source.id:${sourceFilter},from_publication_date:${currentYear-10}-01-01`;
    const mailto = `mailto=${SETTINGS.contactEmail}`;

    // "group_by=publication_year" tells the API to count them, not return the list
    const apiUrl = `${SETTINGS.apiBaseUrl}?${mailto}&search=${encodeURIComponent(keywords)}&filter=${baseFilter}&group_by=publication_year`;

    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`Trend API Error: ${response.status}`);
    const data = await response.json();
    
    // The API returns: { group_by: [ { key: "2024", count: 150 }, { key: "2023", count: 200 } ... ] }
    return data.group_by; 
}