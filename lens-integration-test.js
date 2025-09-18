// Simple test to verify cite-sight can integrate with lens platform SDK
import * as LensPlatform from '@michaelborck/lens-platform-sdk'

const { DocumentLens } = LensPlatform

// Configure the API endpoint
DocumentLens.OpenAPI.BASE = 'http://localhost:8002'

async function testDocumentLensIntegration() {
  console.log('Testing Document-Lens integration from cite-sight...')

  const testText = `
    This is a sample academic text to test the integration between cite-sight and document-lens.
    According to Smith (2023), the integration of microservices can improve system reliability.
    The URL https://example.com provides additional information.
    This text has multiple sentences with varying complexity to test readability analysis.
  `

  try {
    // Test basic text analysis
    console.log('1. Testing basic text analysis...')
    const textResult = await DocumentLens.TextAnalysisService.analyseTextOnlyTextPost({
      text: testText
    })
    console.log('✅ Text analysis successful')
    console.log('   - Word count:', textResult.analysis.word_metrics?.word_count)
    console.log('   - Readability:', textResult.analysis.readability?.flesch_reading_ease)

    // Test academic analysis
    console.log('\n2. Testing academic analysis...')
    const academicResult = await DocumentLens.AcademicAnalysisService.analyseAcademicFeaturesAcademicPost({
      text: testText,
      citation_style: 'apa',
      check_urls: true,
      check_doi: true
    })
    console.log('✅ Academic analysis successful')
    console.log('   - Citations found:', academicResult.analysis.citations?.in_text?.length || 0)
    console.log('   - URLs found:', academicResult.analysis.url_verification?.length || 0)

    console.log('\n🎉 Cite-sight can successfully integrate with document-lens!')
    console.log('📊 Processing times: Text:', textResult.processing_time + 's, Academic:', academicResult.processing_time + 's')

    return true

  } catch (error) {
    console.error('❌ Integration test failed:', error.message)
    console.error('   Make sure document-lens is running on http://localhost:8002')
    return false
  }
}

// Run the test
testDocumentLensIntegration()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(error => {
    console.error('Test execution failed:', error)
    process.exit(1)
  })