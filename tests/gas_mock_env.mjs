import fs from 'node:fs';
import vm from 'node:vm';

function makeIterator(items) {
  let idx = 0;
  const list = items.slice();
  return {
    hasNext() {
      return idx < list.length;
    },
    next() {
      if (idx >= list.length) throw new Error('Iterator exhausted');
      return list[idx++];
    }
  };
}

export function createMockGasEnvironment(options = {}) {
  const foldersById = new Map();
  const filesById = new Map();
  const spreadsheetsById = new Map();
  const scriptProps = new Map(Object.entries(options.scriptProperties || {}));
  const cacheStore = new Map();
  const openedSpreadsheetIds = [];
  const accessedFolderIds = [];
  const lockEvents = [];
  let activeSpreadsheetId = options.activeSpreadsheetId || null;
  let activeUserEmail = options.activeUserEmail || '';
  let nextAutoFileSeq = 1;

  let totalFileGetParentsCalls = 0;

  function makeFolder(id, name, { parentId = null, parentIds = null, trashed = false, throwOnGetParents = false } = {}) {
    const pSet = new Set();
    if (parentId) pSet.add(parentId);
    if (Array.isArray(parentIds)) parentIds.forEach((p) => p && pSet.add(p));
    const folderState = {
      id,
      name,
      parentIds: pSet,
      childFolderIds: new Set(),
      fileIds: new Set(),
      trashed: Boolean(trashed),
      throwOnGetParents: Boolean(throwOnGetParents),
      sharing: null
    };
    const api = {
      _state: folderState,
      getId: () => folderState.id,
      getName: () => folderState.name,
      setName: (n) => { folderState.name = String(n); return api; },
      isTrashed: () => folderState.trashed,
      setTrashed: (t) => { folderState.trashed = Boolean(t); return api; },
      getParents: () => {
        if (folderState.throwOnGetParents) throw new Error('Simulated Drive getParents error on folder ' + folderState.id);
        return makeIterator(Array.from(folderState.parentIds).map((pid) => foldersById.get(pid)).filter(Boolean));
      },
      getFolders: () => makeIterator(Array.from(folderState.childFolderIds).map((cid) => foldersById.get(cid)).filter(Boolean)),
      getFiles: () => makeIterator(Array.from(folderState.fileIds).map((fid) => filesById.get(fid)).filter(Boolean)),
      addFile: (fileObj) => {
        const fid = fileObj.getId();
        folderState.fileIds.add(fid);
        fileObj._state.parentIds.add(folderState.id);
        return api;
      },
      removeFile: (fileObj) => {
        const fid = fileObj.getId();
        folderState.fileIds.delete(fid);
        fileObj._state.parentIds.delete(folderState.id);
        return api;
      },
      createFile: (blob) => {
        const fid = 'gen_file_' + String(nextAutoFileSeq++).padStart(4, '0');
        const created = makeFile(fid, blob.getName(), {
          mimeType: blob.getContentType(),
          bytes: blob.getBytes(),
          parentId: folderState.id
        });
        return created;
      },
      setSharing: (access, perm) => {
        folderState.sharing = { access, perm };
        return api;
      }
    };
    foldersById.set(id, api);
    for (const pid of pSet) {
      if (foldersById.has(pid)) {
        foldersById.get(pid)._state.childFolderIds.add(id);
      }
    }
    return api;
  }

  function makeFile(id, name, {
    mimeType = 'image/jpeg',
    bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    parentId = null,
    parentIds = null,
    trashed = false,
    updatedAt = new Date('2026-11-19T12:00:00.000Z'),
    targetId = null,
    throwOnGetParents = false
  } = {}) {
    const pSet = new Set();
    if (parentId) pSet.add(parentId);
    if (Array.isArray(parentIds)) parentIds.forEach((p) => p && pSet.add(p));

    const fileState = {
      id,
      name,
      mimeType,
      bytes: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []),
      parentIds: pSet,
      trashed: Boolean(trashed),
      updatedAt: updatedAt instanceof Date ? updatedAt : new Date(updatedAt),
      sharing: null,
      description: '',
      targetId,
      throwOnGetParents: Boolean(throwOnGetParents),
      getParentsCalls: 0
    };

    const api = {
      _state: fileState,
      getId: () => fileState.id,
      getName: () => fileState.name,
      setName: (n) => { fileState.name = String(n); return api; },
      getMimeType: () => fileState.mimeType,
      getSize: () => fileState.bytes.length,
      getLastUpdated: () => fileState.updatedAt,
      isTrashed: () => fileState.trashed,
      setTrashed: (t) => { fileState.trashed = Boolean(t); return api; },
      getTargetId: () => fileState.targetId,
      getParents: () => {
        fileState.getParentsCalls++;
        totalFileGetParentsCalls++;
        if (fileState.throwOnGetParents) throw new Error('Simulated Drive getParents error on file ' + fileState.id);
        return makeIterator(Array.from(fileState.parentIds).map((pid) => foldersById.get(pid)).filter(Boolean));
      },
      moveTo: (destFolder) => {
        for (const oldPid of Array.from(fileState.parentIds)) {
          const oldF = foldersById.get(oldPid);
          if (oldF) oldF._state.fileIds.delete(fileState.id);
        }
        fileState.parentIds.clear();
        fileState.parentIds.add(destFolder.getId());
        destFolder._state.fileIds.add(fileState.id);
        return api;
      },
      makeCopy: (copyName, destFolder) => {
        const cid = 'copy_file_' + String(nextAutoFileSeq++).padStart(4, '0');
        return makeFile(cid, copyName || fileState.name, {
          mimeType: fileState.mimeType,
          bytes: Buffer.from(fileState.bytes),
          parentId: destFolder.getId()
        });
      },
      setSharing: (access, perm) => {
        fileState.sharing = { access, perm };
        return api;
      },
      setDescription: (d) => {
        fileState.description = String(d || '');
        return api;
      },
      getDescription: () => fileState.description,
      getThumbnail: () => null
    };

    filesById.set(id, api);
    for (const pid of pSet) {
      if (foldersById.has(pid)) {
        foldersById.get(pid)._state.fileIds.add(id);
      }
    }
    return api;
  }

  function makeSheet(name, initialRows = [], maxCols = 60) {
    const grid = [];
    const writeLog = [];
    let hidden = false;

    function ensureSize(r, c) {
      while (grid.length < r) grid.push([]);
      for (let i = 0; i < grid.length; i++) {
        while (grid[i].length < c) grid[i].push('');
      }
    }

    for (let r = 0; r < initialRows.length; r++) {
      const rowArr = Array.isArray(initialRows[r]) ? initialRows[r].slice() : [];
      grid.push(rowArr);
    }
    if (grid.length > 0) ensureSize(grid.length, maxCols);

    const api = {
      _grid: grid,
      _writeLog: writeLog,
      _isHidden: () => hidden,
      getName: () => name,
      hideSheet: () => { hidden = true; },
      getMaxRows: () => Math.max(grid.length, 20),
      getMaxColumns: () => maxCols,
      getLastRow: () => {
        for (let r = grid.length - 1; r >= 0; r--) {
          if (grid[r].some((v) => v !== '' && v !== null && v !== undefined)) return r + 1;
        }
        return 0;
      },
      getLastColumn: () => {
        let maxC = 0;
        for (let r = 0; r < grid.length; r++) {
          for (let c = grid[r].length - 1; c >= 0; c--) {
            if (grid[r][c] !== '' && grid[r][c] !== null && grid[r][c] !== undefined) {
              if (c + 1 > maxC) maxC = c + 1;
              break;
            }
          }
        }
        return maxC;
      },
      insertRowAfter: (afterPos) => {
        ensureSize(afterPos + 1, maxCols);
      },
      insertRowsAfter: (afterPos, howMany) => {
        ensureSize(afterPos + howMany, maxCols);
      },
      getRange: (row, col, numRows = 1, numCols = 1) => {
        ensureSize(row + numRows - 1, col + numCols - 1);
        const rangeApi = {
          getValue: () => grid[row - 1][col - 1],
          getDisplayValue: () => String(grid[row - 1][col - 1] ?? ''),
          getValues: () => {
            const out = [];
            for (let r = 0; r < numRows; r++) {
              const rowSlice = [];
              for (let c = 0; c < numCols; c++) {
                rowSlice.push(grid[row - 1 + r][col - 1 + c] ?? '');
              }
              out.push(rowSlice);
            }
            return out;
          },
          getDisplayValues: () => {
            const out = [];
            for (let r = 0; r < numRows; r++) {
              const rowSlice = [];
              for (let c = 0; c < numCols; c++) {
                const v = grid[row - 1 + r][col - 1 + c];
                rowSlice.push(v === null || v === undefined ? '' : String(v));
              }
              out.push(rowSlice);
            }
            return out;
          },
          setValue: (val) => {
            writeLog.push({ row, col, numRows: 1, numCols: 1, value: val });
            grid[row - 1][col - 1] = val;
            return rangeApi;
          },
          setValues: (vals) => {
            writeLog.push({ row, col, numRows, numCols, values: vals });
            for (let r = 0; r < numRows; r++) {
              for (let c = 0; c < numCols; c++) {
                grid[row - 1 + r][col - 1 + c] = vals[r][c];
              }
            }
            return rangeApi;
          },
          clearContent: () => {
            writeLog.push({ row, col, numRows, numCols, cleared: true });
            for (let r = 0; r < numRows; r++) {
              for (let c = 0; c < numCols; c++) {
                grid[row - 1 + r][col - 1 + c] = '';
              }
            }
            return rangeApi;
          },
          setNumberFormat: () => rangeApi,
          setFontWeight: () => rangeApi,
          setBackground: () => rangeApi,
          setFontColor: () => rangeApi
        };
        return rangeApi;
      }
    };
    return api;
  }

  function makeSpreadsheet(id, name, sheetsMap = {}) {
    const sheets = new Map();
    for (const [tabName, rows] of Object.entries(sheetsMap)) {
      sheets.set(tabName, makeSheet(tabName, rows));
    }
    const ssApi = {
      _sheets: sheets,
      getId: () => id,
      getName: () => name,
      getSheetByName: (tabName) => sheets.get(tabName) || null,
      getSheets: () => Array.from(sheets.values()),
      insertSheet: (tabName) => {
        const sh = makeSheet(tabName, []);
        sheets.set(tabName, sh);
        return sh;
      }
    };
    spreadsheetsById.set(id, ssApi);
    return ssApi;
  }

  const uiAlerts = [];
  const createdMenus = [];

  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    RegExp,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Error,
    isFinite,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', PRIVATE: 'PRIVATE' },
      Permission: { VIEW: 'VIEW', EDIT: 'EDIT' },
      getFolderById: (id) => {
        accessedFolderIds.push(id);
        const f = foldersById.get(id);
        if (!f) throw new Error('Folder not found: ' + id);
        return f;
      },
      getFileById: (id) => {
        const f = filesById.get(id);
        if (!f) throw new Error('File not found: ' + id);
        return f;
      },
      getFoldersByName: (name) => {
        const matches = Array.from(foldersById.values()).filter((f) => f.getName() === name);
        return makeIterator(matches);
      }
    },
    SpreadsheetApp: {
      openById: (id) => {
        openedSpreadsheetIds.push(id);
        const ss = spreadsheetsById.get(id);
        if (!ss) throw new Error('Spreadsheet not found: ' + id);
        return ss;
      },
      getActiveSpreadsheet: () => {
        if (!activeSpreadsheetId) return null;
        return spreadsheetsById.get(activeSpreadsheetId) || null;
      },
      flush: () => {},
      getUi: () => ({
        ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL' },
        Button: { OK: 'OK', CANCEL: 'CANCEL' },
        createMenu: (title) => {
          const menuObj = { title, items: [] };
          const chain = {
            addItem: (label, fnName) => { menuObj.items.push({ label, fnName }); return chain; },
            addSeparator: () => chain,
            addToUi: () => { createdMenus.push(menuObj); }
          };
          return chain;
        },
        alert: (title, msg) => { uiAlerts.push({ title, msg }); },
        prompt: (title, msg) => {
          const next = promptResponses.length > 0
            ? promptResponses.shift()
            : { button: 'OK', text: 'https://script.google.com/macros/s/MOCK_DEPLOY_ID_12345/exec' };
          return {
            getSelectedButton: () => next.button || 'OK',
            getResponseText: () => (next.text !== undefined ? next.text : '')
          };
        }
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (scriptProps.has(k) ? scriptProps.get(k) : null),
        setProperty: (k, v) => { scriptProps.set(k, String(v)); },
        deleteProperty: (k) => { scriptProps.delete(k); }
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (cacheStore.has(k) ? cacheStore.get(k) : null),
        put: (k, v) => { cacheStore.set(k, String(v)); },
        remove: (k) => { cacheStore.delete(k); }
      })
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: (ms) => { lockEvents.push({ type: 'acquire', ms }); },
        releaseLock: () => { lockEvents.push({ type: 'release' }); }
      })
    },
    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: (text) => {
        const out = {
          _text: String(text),
          _mime: 'text/plain',
          setMimeType(m) { out._mime = m; return out; },
          getContent() { return out._text; },
          getMimeType() { return out._mime; }
        };
        return out;
      }
    },
    Utilities: {
      base64Decode: (b64) => Buffer.from(String(b64), 'base64'),
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
      newBlob: (bytes, contentType, name) => {
        const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
        return {
          getBytes: () => buf,
          getContentType: () => contentType,
          getName: () => name
        };
      },
      formatDate: (date, _tz, _fmt) => date.toISOString()
    },
    Session: {
      getActiveUser: () => ({
        getEmail: () => activeUserEmail
      }),
      getEffectiveUser: () => ({
        getEmail: () => activeUserEmail || 'kevin.reyna@grupoanipa.com'
      })
    },
    ScriptApp: {
      getService: () => ({
        getUrl: () => options.webAppUrl || 'https://script.google.com/macros/s/AKfycbMOCKPROMPTSWEBAPP/exec'
      })
    }
  };

  const promptResponses = [];
  const context = vm.createContext(sandbox);

  return {
    context,
    makeFolder,
    makeFile,
    makeSpreadsheet,
    foldersById,
    filesById,
    spreadsheetsById,
    scriptProps,
    cacheStore,
    openedSpreadsheetIds,
    accessedFolderIds,
    lockEvents,
    uiAlerts,
    createdMenus,
    promptResponses,
    getTotalFileGetParentsCalls: () => totalFileGetParentsCalls,
    resetFileGetParentsCalls: () => { totalFileGetParentsCalls = 0; },
    setActiveUserEmail: (e) => { activeUserEmail = e; },
    setActiveSpreadsheetId: (id) => { activeSpreadsheetId = id; },
    loadScript(filePath) {
      const src = fs.readFileSync(filePath, 'utf8');
      vm.runInContext(src, context, { filename: filePath });
    }
  };
}
