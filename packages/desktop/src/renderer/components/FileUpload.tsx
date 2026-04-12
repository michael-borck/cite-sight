import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useStore } from '../store';
import './FileUpload.css';

const ACCEPTED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB for desktop

export function FileUpload() {
  const { filePaths, addFiles, removeFile, clearFiles } = useStore();

  // react-dropzone gives us File objects; in Electron we need the actual disk path
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      // In Electron, File objects from the renderer have a `path` property
      const paths = acceptedFiles
        .map((f) => (f as File & { path?: string }).path)
        .filter((p): p is string => typeof p === 'string' && p.length > 0);
      if (paths.length > 0) {
        addFiles(paths);
      }
    },
    [addFiles],
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
  });

  const handleBrowseFiles = async () => {
    const selected = await window.citeSight.selectFiles();
    if (selected.length > 0) {
      addFiles(selected);
    }
  };

  const handleBrowseFolder = async () => {
    const selected = await window.citeSight.selectFolder();
    if (selected.length > 0) {
      addFiles(selected);
    }
  };

  const getFileExtension = (filePath: string): string => {
    return filePath.split('.').pop()?.toLowerCase() ?? 'txt';
  };

  const getFileName = (filePath: string): string => {
    return filePath.split(/[\\/]/).pop() ?? filePath;
  };

  return (
    <div className="file-upload-container">
      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? 'active' : ''} ${filePaths.length > 0 ? 'has-files' : ''}`}
      >
        <input {...getInputProps()} />

        <div className="dropzone-content">
          <div className="dropzone-icon">&#128196;</div>
          {isDragActive ? (
            <p className="dropzone-text">Drop the files here...</p>
          ) : (
            <>
              <p className="dropzone-text">Drag &amp; drop documents here, or</p>
              <div className="browse-buttons">
                <button type="button" className="btn btn-primary" onClick={(e) => { e.stopPropagation(); void handleBrowseFiles(); }}>
                  Browse Files
                </button>
                <button type="button" className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); void handleBrowseFolder(); }}>
                  Browse Folder
                </button>
              </div>
              <p className="dropzone-hint">PDF &middot; DOCX &middot; TXT &middot; MD &mdash; max 50 MB</p>
            </>
          )}
        </div>
      </div>

      {fileRejections.length > 0 && (
        <div className="file-errors">
          {fileRejections.map(({ file, errors }) => (
            <div key={file.name} className="error-item">
              <strong>{file.name}</strong>
              {errors.map((e) => (
                <span key={e.code}> - {e.message}</span>
              ))}
            </div>
          ))}
        </div>
      )}

      {filePaths.length > 0 && (
        <div className="file-list">
          <div className="file-list-header">
            <h3>Selected Files ({filePaths.length})</h3>
            <button onClick={clearFiles} className="btn btn-secondary">
              Clear All
            </button>
          </div>

          <div className="files">
            {filePaths.map((fp) => (
              <div key={fp} className="file-item">
                <div className="file-info">
                  <span className={`file-type-badge ${getFileExtension(fp)}`}>{getFileExtension(fp)}</span>
                  <div className="file-details">
                    <span className="file-name">{getFileName(fp)}</span>
                    <span className="file-size">{fp}</span>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(fp)}
                  className="file-remove"
                  aria-label={`Remove ${getFileName(fp)}`}
                >
                  &#10005;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
