# CiteSight

**Academic Integrity Platform**

A React-based frontend application for analyzing academic documents, detecting suspicious patterns, and ensuring research integrity.

## 🚀 Quick Start

```bash
# Setup and start
./start.sh

# Application available at: http://localhost:5173
```

## 🎯 Features

- **Document Upload**: Drag & drop PDF, DOCX, PPTX, TXT, MD, JSON files
- **Citation Analysis**: Extract and verify academic references
- **Integrity Checking**: Detect suspicious patterns and potential issues
- **Quality Assessment**: Readability and writing quality metrics
- **Multi-Document Comparison**: Analyze multiple documents together

## 🔧 Backend Service

CiteSight requires the DocumentLens API service for document analysis.

**DocumentLens Repository**: https://github.com/michael-borck/document-lens

To run both services:
1. Start DocumentLens backend:
   ```bash
   cd ../document-lens
   ./start.sh
   # API available at: http://localhost:8000
   ```

2. Start CiteSight frontend:
   ```bash
   cd ../cite-sight
   ./start.sh
   # App available at: http://localhost:5173
   ```

Configure API endpoint via `.env`:
```
VITE_API_URL=http://localhost:8000/api
```

## 📚 Technology Stack

- React 18 + TypeScript
- Vite for development and building
- Zustand for state management
- Axios for API communication
- React Tabs for results display
- React Dropzone for file uploads

---

*CiteSight: Academic integrity through intelligent analysis*
