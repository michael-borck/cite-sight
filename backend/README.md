# DocumentLens

**Multi-Modal Document Analysis Microservice**

Transform any content into actionable insights through comprehensive text analysis, academic integrity checking, and future multi-modal capabilities.

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-Latest-green.svg)](https://fastapi.tiangolo.com)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 🎯 Overview

DocumentLens is a production-ready microservice that provides:
- **Core Text Analysis**: Readability scores, writing quality, word frequency
- **Academic Analysis**: Citation extraction, DOI resolution, URL verification  
- **Multi-Modal Ready**: Designed for future audio/video analysis
- **Modular APIs**: Choose exactly the features you need

## 🚀 Quick Start

### Option 1: Automated Setup
```bash
./start.sh
```

### Option 2: Manual Setup
```bash
# Setup virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start service
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Service available at:**
- 🔧 API: http://localhost:8000
- 📚 Documentation: http://localhost:8000/api/docs
- 🔍 Health Check: http://localhost:8000/api/health

## 📊 API Endpoints

### Current (MVP)

#### Full Analysis (Backward Compatibility)
```http
POST /api/analyze
Content-Type: multipart/form-data

# Upload files + options (current CiteSight compatibility)
```

#### Modular Text Analysis
```http
POST /api/analyze/text
Content-Type: application/json

{
  "text": "Your document content here...",
  "options": {}
}
```

**Response:**
```json
{
  "service": "DocumentLens",
  "analysis": {
    "text_metrics": {
      "word_count": 1500,
      "sentence_count": 75,
      "paragraph_count": 12
    },
    "readability": {
      "flesch_score": 65.2,
      "flesch_kincaid_grade": 8.1,
      "interpretation": "Standard (8th-9th grade level)"
    },
    "writing_quality": {
      "passive_voice_percentage": 12.5,
      "sentence_variety_score": 7.3
    },
    "word_analysis": {
      "unique_words": 342,
      "vocabulary_richness": 0.65
    }
  }
}
```

#### Academic Analysis
```http
POST /api/analyze/academic
Content-Type: application/json

{
  "text": "Academic paper content...",
  "citation_style": "apa",
  "check_urls": true,
  "check_doi": true
}
```

**Response:**
```json
{
  "service": "DocumentLens", 
  "analysis": {
    "references": {
      "total": 15,
      "broken_urls": 2,
      "unresolved_dois": 1
    },
    "citations": {
      "detected_style": "apa",
      "extracted": 15
    },
    "integrity": {
      "risk_score": 25.0,
      "patterns_detected": 2
    }
  }
}
```

### Planned Features

#### File Upload Analysis
```http
POST /api/analyze/files  # Coming soon
Content-Type: multipart/form-data

# Will support: PDF, DOCX, PPTX, TXT, MD, JSON
```

#### Multi-Modal Analysis
```http
POST /api/analyze/audio   # Future
POST /api/analyze/video   # Future
```

#### Development Roadmap
```http
GET /api/analyze/roadmap  # View planned features
```

## 🏗️ Architecture

### Service Philosophy
- **Focused**: Specialized in content analysis
- **Modular**: Granular API endpoints for specific needs
- **Extensible**: Ready for multi-modal expansion
- **Fast**: Optimized for performance and scalability

### Technology Stack
- **FastAPI**: High-performance API framework
- **Pydantic**: Data validation and settings
- **TextStat**: Readability calculations
- **NLTK**: Natural language processing
- **Uvicorn**: ASGI server

### Project Structure
```
document-lens/
├── app/
│   ├── analyzers/          # Text analysis modules
│   ├── api/routes/         # API endpoints
│   ├── core/               # Configuration
│   ├── models/             # Data models
│   └── services/           # External service integrations
├── requirements.txt        # Dependencies
├── pyproject.toml         # Project configuration
└── start.sh              # Quick start script
```

## 💡 Use Cases

### Blog/Content Analysis
```python
import requests

response = requests.post('http://localhost:8000/api/analyze/text', 
                        json={'text': blog_content})
readability = response.json()['analysis']['readability']['flesch_score']
print(f"Readability score: {readability}")
```

### Academic Research
```python
response = requests.post('http://localhost:8000/api/analyze/academic',
                        json={
                          'text': research_paper,
                          'citation_style': 'apa',
                          'check_urls': True
                        })
integrity = response.json()['analysis']['integrity']['risk_score']
```

### Multi-Client Service
DocumentLens can serve multiple applications:
- **CiteSight**: Academic integrity platform
- **Blog analyzers**: Content quality assessment
- **Writing tools**: Real-time writing assistance
- **Research platforms**: Citation verification

## 🔧 Configuration

### Environment Variables (.env)
```env
DEBUG=true
MAX_FILE_SIZE=10485760
RATE_LIMIT=100/hour
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
SECRET_KEY=your-secret-key-here
```

### Rate Limiting
- Default: 100 requests per hour per IP
- Configurable via `RATE_LIMIT` environment variable
- Applied to all analysis endpoints

### CORS Configuration
- Supports multiple frontend origins
- Configurable via `ALLOWED_ORIGINS`
- Comma-separated list format

## 🚀 Deployment

### Docker (Recommended)
```dockerfile
# Dockerfile included in repository
docker build -t document-lens .
docker run -p 8000:8000 document-lens
```

### Production Server
```bash
# Using Gunicorn
pip install gunicorn
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
```

## 🔮 Future Roadmap

### Phase 2: Document Processing
- File upload endpoints
- PDF/DOCX/PPTX text extraction
- Batch processing
- Document comparison

### Phase 3: Multi-Modal Analysis  
- Audio transcription + analysis
- Video content extraction
- Cross-modal correlation
- Integrated analysis workflows

### Phase 4: Advanced Features
- AI-powered suggestions
- Real-time streaming analysis
- Custom analysis pipelines
- Enterprise integrations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built on excellent open-source libraries:
- [TextStat](https://github.com/textstat/textstat) for readability calculations
- [FastAPI](https://fastapi.tiangolo.com/) for the API framework
- [NLTK](https://www.nltk.org/) for natural language processing

---

**DocumentLens: See through your content** 🔍

*Transform any document into actionable insights*