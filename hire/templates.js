// hire/templates.js
// Storage for saved server templates (the "template bank").
//
// /copyserver writes a template here; /pasteserver reads one back. Every
// template is one entry in data/templates.json, keyed by a lowercase slug of
// its name, so the bank survives restarts and stays on the host machine.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TEMPLATES_PATH = path.join(DATA_DIR, 'templates.json');

function slugify(name) {
    return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function readAll() {
    try {
        return JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf-8'));
    } catch {
        return {};
    }
}

function writeAll(data) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(data, null, 2));
}

// Save (or overwrite) a template under a name.
function saveTemplate(name, template) {
    const data = readAll();
    const key = slugify(name);
    data[key] = { ...template, key, name };
    writeAll(data);
    return data[key];
}

// Get one template by its name (or slug).
function getTemplate(name) {
    const data = readAll();
    return data[slugify(name)] || null;
}

// List every saved template (name + a little metadata).
function listTemplates() {
    return Object.values(readAll());
}

module.exports = { slugify, saveTemplate, getTemplate, listTemplates, readAll };
