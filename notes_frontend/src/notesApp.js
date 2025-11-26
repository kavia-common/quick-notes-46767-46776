import { loadNotes, saveNotes, newNote as makeNewNote } from './lib/storage.js';
import { listNotes, createNote, updateNote, deleteNote, useApi } from './lib/api.js';

/**
 * PUBLIC_INTERFACE
 * createApp
 * Mounts the Notes application into a container element.
 * Provides sidebar listing, search, and main editor with create/save/delete,
 * keyboard shortcuts (Ctrl/Cmd+N, Ctrl/Cmd+S), and persistence with API fallback.
 */
export function createApp(container) {
  container.innerHTML = `
    <div class="app-shell" role="application" aria-label="Notes">
      <aside class="sidebar" aria-label="Note list">
        <div class="sidebar-header">
          <div class="brand">
            <div class="brand-badge" aria-hidden="true"></div>
            Quick Notes
          </div>
          <div>
            <button class="icon-btn" id="helpBtn" title="Shortcuts (Shift+/)">?</button>
            <button class="icon-btn primary" id="newBtn" title="New note (Ctrl/Cmd+N)">New</button>
          </div>
        </div>
        <div class="search">
          <svg width="16" height="16" fill="currentColor" aria-hidden="true" viewBox="0 0 24 24"><path d="M21 21l-4.35-4.35m1.35-4.65a7 7 0 11-14 0 7 7 0 0114 0z" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
          <input id="searchInput" type="search" placeholder="Search notes..." aria-label="Search notes"/>
        </div>
        <div id="noteList" class="note-list" role="list"></div>
      </aside>
      <main class="content" id="mainPane" role="main">
        <div class="editor-card" id="editorCard">
          <div class="editor-header">
            <input id="titleInput" class="title-input" type="text" placeholder="Note title" aria-label="Note title"/>
            <div class="toolbar">
              <button class="action-btn" id="saveBtn" title="Save (Ctrl/Cmd+S)">Save</button>
              <button class="action-btn danger" id="deleteBtn" title="Delete note">Delete</button>
            </div>
          </div>
          <textarea id="contentInput" class="textarea" placeholder="Write your note here... (Markdown-friendly)"></textarea>
          <div class="footer">
            <span class="badge" id="statusBadge">Ready</span>
            <span id="timestamp" class="meta"></span>
          </div>
        </div>
      </main>
    </div>
  `;

  const state = {
    notes: [],
    selectedId: null,
    search: '',
    usingApi: false,
  };

  // DOM refs
  const noteList = container.querySelector('#noteList');
  const searchInput = container.querySelector('#searchInput');
  const titleInput = container.querySelector('#titleInput');
  const contentInput = container.querySelector('#contentInput');
  const saveBtn = container.querySelector('#saveBtn');
  const deleteBtn = container.querySelector('#deleteBtn');
  const newBtn = container.querySelector('#newBtn');
  const timestamp = container.querySelector('#timestamp');
  const statusBadge = container.querySelector('#statusBadge');
  const helpBtn = container.querySelector('#helpBtn');

  // Helpers
  function fmtTime(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleString();
    } catch {
      return '';
    }
  }

  function setStatus(text, tone = 'info') {
    statusBadge.textContent = text;
    statusBadge.style.background = tone === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(37,99,235,0.08)';
    statusBadge.style.color = tone === 'error' ? '#EF4444' : '#2563EB';
    statusBadge.style.borderColor = tone === 'error' ? 'rgba(239,68,68,0.35)' : 'rgba(37,99,235,0.25)';
  }

  function getSelected() {
    return state.notes.find(n => n.id === state.selectedId) || null;
  }

  function renderList() {
    const q = state.search.trim().toLowerCase();
    const filtered = state.notes.filter(n => {
      if (!q) return true;
      return (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q);
    }).sort((a, b) => b.updatedAt - a.updatedAt);

    noteList.innerHTML = '';
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <div class="empty-card">
          <h2>No notes yet</h2>
          <p>Create your first note with <kbd>Ctrl/Cmd + N</kbd></p>
          <button class="action-btn primary" id="emptyNew">Create note</button>
        </div>
      `;
      noteList.appendChild(empty);
      const btn = empty.querySelector('#emptyNew');
      btn.addEventListener('click', handleNew);
      return;
    }

    for (const n of filtered) {
      const item = document.createElement('div');
      item.className = 'note-item' + (n.id === state.selectedId ? ' active' : '');
      item.setAttribute('role', 'listitem');
      item.innerHTML = `
        <div>
          <h4>${escapeHtml(n.title || 'Untitled')}</h4>
          <div class="meta">${fmtTime(n.updatedAt)}</div>
        </div>
        <div>
          <button class="delete" title="Delete note" aria-label="Delete note">✕</button>
        </div>
      `;
      item.addEventListener('click', (e) => {
        // Avoid parent click when pressing delete
        if (e.target && e.target.classList.contains('delete')) return;
        state.selectedId = n.id;
        fillEditor();
        renderList();
      });
      item.querySelector('.delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        await handleDelete(n.id);
      });
      noteList.appendChild(item);
    }
  }

  function fillEditor() {
    const sel = getSelected();
    if (!sel) {
      titleInput.value = '';
      contentInput.value = '';
      timestamp.textContent = '';
      return;
    }
    titleInput.value = sel.title || '';
    contentInput.value = sel.content || '';
    timestamp.textContent = `Updated ${fmtTime(sel.updatedAt)}`;
  }

  async function bootstrap() {
    try {
      state.usingApi = await useApi();
    } catch {
      state.usingApi = false;
    }
    setStatus(state.usingApi ? 'API connected' : 'Local mode');
    try {
      // Try loading via API (with fallback handled inside)
      state.notes = await listNotes();
    } catch {
      state.notes = loadNotes();
    }
    if (state.notes.length) state.selectedId = state.notes[0].id;
    renderList();
    fillEditor();
  }

  function selectOrCreateFirst() {
    if (!state.notes.length) {
      state.selectedId = null;
      renderList();
      fillEditor();
    } else if (!state.selectedId || !state.notes.find(n => n.id === state.selectedId)) {
      state.selectedId = state.notes[0].id;
      renderList();
      fillEditor();
    }
  }

  async function handleNew() {
    const note = makeNewNote();
    state.notes.unshift(note);
    try {
      await createNote(note);
    } finally {
      saveNotes(state.notes);
    }
    state.selectedId = note.id;
    renderList();
    fillEditor();
    titleInput.focus();
    titleInput.select();
    setStatus('New note created');
  }

  async function handleSave() {
    const sel = getSelected();
    if (!sel) {
      // If no selection but inputs have content, create a new note
      const hasContent = titleInput.value.trim() || contentInput.value.trim();
      if (!hasContent) {
        setStatus('Nothing to save');
        return;
      }
      return handleNewAndSaveFromInputs();
    }
    sel.title = titleInput.value.trim() || 'Untitled';
    sel.content = contentInput.value;
    sel.updatedAt = Date.now();

    try {
      await updateNote(sel);
      setStatus('Saved');
    } catch {
      setStatus('Saved (local)', 'info');
    } finally {
      saveNotes(state.notes);
    }
    renderList();
    fillEditor();
  }

  async function handleNewAndSaveFromInputs() {
    const note = makeNewNote();
    note.title = titleInput.value.trim() || 'Untitled';
    note.content = contentInput.value;
    note.updatedAt = Date.now();
    state.notes.unshift(note);
    try {
      await createNote(note);
      setStatus('Saved');
    } catch {
      setStatus('Saved (local)');
    } finally {
      saveNotes(state.notes);
    }
    state.selectedId = note.id;
    renderList();
    fillEditor();
  }

  async function handleDelete(id) {
    const targetId = id || state.selectedId;
    if (!targetId) return;
    const idx = state.notes.findIndex(n => n.id === targetId);
    if (idx === -1) return;
    const confirmed = confirm('Delete this note? This cannot be undone.');
    if (!confirmed) return;
    try {
      await deleteNote(targetId);
      setStatus('Deleted');
    } catch {
      setStatus('Deleted (local)');
    } finally {
      state.notes.splice(idx, 1);
      saveNotes(state.notes);
    }
    selectOrCreateFirst();
  }

  function handleSearch(e) {
    state.search = e.target.value;
    renderList();
  }

  // Escaping for title render
  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  // Events
  searchInput.addEventListener('input', handleSearch);
  newBtn.addEventListener('click', handleNew);
  saveBtn.addEventListener('click', handleSave);
  deleteBtn.addEventListener('click', () => handleDelete());

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      handleNew();
    }
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      handleSave();
    }
    if (e.shiftKey && e.key === '?') {
      e.preventDefault();
      showHelp();
    }
  });

  helpBtn.addEventListener('click', showHelp);

  function showHelp() {
    alert('Shortcuts:\n• New note: Ctrl/Cmd + N\n• Save note: Ctrl/Cmd + S\n• Help: Shift + /');
  }

  // Auto-save on blur
  titleInput.addEventListener('blur', () => {
    if (titleInput.value.trim() !== (getSelected()?.title || '')) handleSave();
  });
  contentInput.addEventListener('blur', () => {
    if (contentInput.value !== (getSelected()?.content || '')) handleSave();
  });

  // Init
  bootstrap();
}
