const fs = require('fs');
const path = require('path');

const RAW_TXT = path.join(__dirname, '..', 'BNS2023_raw.txt');
const OUT_JSON = path.join(__dirname, '..', 'bns_sections.json');

function parseBNS() {
    const rawData = fs.readFileSync(RAW_TXT, 'utf8');
    
    // Split by lines and clean up whitespace
    let lines = rawData.split('\n').map(l => l.trimRight());
    
    // Find where the actual content starts
    let startIndex = lines.findIndex(l => l === 'CHAPTER I' && lines[lines.indexOf(l) + 1] === 'PRELIMINARY' && lines[lines.indexOf(l) + 2].includes('Short title'));
    if (startIndex === -1) {
        startIndex = lines.findIndex(l => l.match(/^1\. \(\1\)/));
    }
    // Fallback if not found perfectly
    startIndex = 3280; 

    // Filter out page numbers and blank lines to make parsing easier
    lines = lines.slice(startIndex).filter(line => {
        if (line.trim() === '') return false;
        if (line.trim() === 'HomePage') return false;
        if (line.match(/^\d+$/)) return false; // Page numbers alone on a line
        return true;
    });

    const sections = [];
    let currentSection = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Match a new section start: e.g. "1. (1) This Act" or "3. (1) Throughout" or "358. (1) The Indian"
        const sectionMatch = line.match(/^\s*(\d+)\.\s*(.*)/);
        
        if (sectionMatch) {
            const sectionNum = sectionMatch[1];
            // The title is usually the line right before the section starts
            let title = '';
            if (i > 0 && !lines[i-1].match(/^CHAPTER/)) {
                title = lines[i-1];
            }
            
            // If we already have a section, finalize its content by removing the title of the NEXT section from its end
            if (currentSection) {
                if (title && currentSection.content.endsWith(title)) {
                    currentSection.content = currentSection.content.substring(0, currentSection.content.length - title.length).trim();
                }
                sections.push(currentSection);
            }
            
            currentSection = {
                section: sectionNum,
                title: title.replace(/\.$/, ''), // Remove trailing period from title
                content: sectionMatch[2] + '\n'
            };
        } else if (currentSection) {
            // Append to current section content, skip chapters headers for the content
            if (!line.startsWith('CHAPTER ')) {
                currentSection.content += line + '\n';
            }
        }
    }
    
    // push the last one
    if (currentSection) {
        sections.push(currentSection);
    }

    // Write to JSON
    fs.writeFileSync(OUT_JSON, JSON.stringify(sections, null, 2));
    console.log(`Parsed ${sections.length} sections and saved to ${OUT_JSON}`);
}

parseBNS();
