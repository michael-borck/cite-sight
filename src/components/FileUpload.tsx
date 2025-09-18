import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useStore } from '../store';
import './FileUpload.css';

const ACCEPTED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
  'application/json': ['.json'],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const FileUpload: React.FC = () => {
  const { files, addFiles, removeFile, clearFiles } = useStore();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      addFiles(acceptedFiles);
    },
    [addFiles]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (type: string): string => {
    if (type === 'application/pdf') return '📄';
    if (type.includes('word')) return '📝';
    if (type.includes('presentation')) return '📊';
    if (type.includes('text')) return '📃';
    if (type === 'application/json') return '🔧';
    return '📎';
  };

  return (
    <div className="file-upload-container">
      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? 'active' : ''} ${files.length > 0 ? 'has-files' : ''}`}
      >
        <input {...getInputProps()} />
        
        <div className="dropzone-content">
          <div className="upload-icon">📤</div>
          {isDragActive ? (
            <p>Drop the files here...</p>
          ) : (
            <>
              <p>Drag & drop documents here, or click to select</p>
              <p className="file-types">
                Supported: PDF, DOCX, PPTX, TXT, MD, JSON (max 10MB each)
              </p>
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

      {files.length > 0 && (
        <div className="file-list">
          <div className="file-list-header">
            <h3>Selected Files ({files.length})</h3>
            <button onClick={clearFiles} className="clear-btn">
              Clear All
            </button>
          </div>
          
          <div className="files">
            {files.map((fileInfo) => (
              <div key={fileInfo.id} className="file-item">
                <div className="file-info">
                  <span className="file-icon">{getFileIcon(fileInfo.type)}</span>
                  <div className="file-details">
                    <span className="file-name">{fileInfo.name}</span>
                    <span className="file-size">{formatFileSize(fileInfo.size)}</span>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(fileInfo.id)}
                  className="remove-btn"
                  aria-label={`Remove ${fileInfo.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};