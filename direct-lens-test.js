// Direct HTTP integration test with lens services
// This demonstrates the clean, simple integration pattern (no SDK needed)

async function testDirectDocumentLensIntegration() {
  console.log('Testing direct HTTP integration with document-lens...')

  const testText = `
    This is a sample academic text to test the integration between cite-sight and document-lens.
    According to Smith (2023), the integration of microservices can improve system reliability.
    The URL https://example.com provides additional information.
    This text has multiple sentences with varying complexity to test readability analysis.
  `

  try {
    console.log('1. Testing basic text analysis...')

    const textResponse = await fetch('http://localhost:8002/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: testText,
        options: {}
      })
    })

    if (!textResponse.ok) {
      throw new Error(`Text analysis failed: ${textResponse.status} ${textResponse.statusText}`)
    }

    const textResult = await textResponse.json()
    console.log('✅ Text analysis successful')
    console.log('   - Word count:', textResult.analysis.word_metrics?.word_count)
    console.log('   - Readability:', textResult.analysis.readability?.flesch_reading_ease)

    console.log('\n2. Testing academic analysis...')

    const academicResponse = await fetch('http://localhost:8002/academic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: testText,
        citation_style: 'apa',
        check_urls: true,
        check_doi: true,
        check_plagiarism: false,
        check_in_text: true
      })
    })

    if (!academicResponse.ok) {
      throw new Error(`Academic analysis failed: ${academicResponse.status} ${academicResponse.statusText}`)
    }

    const academicResult = await academicResponse.json()
    console.log('✅ Academic analysis successful')
    console.log('   - Citations found:', academicResult.analysis.citations?.in_text?.length || 0)
    console.log('   - URLs found:', academicResult.analysis.url_verification?.length || 0)

    console.log('\n3. Testing service health check...')

    const healthResponse = await fetch('http://localhost:8002/health')
    if (!healthResponse.ok) {
      throw new Error(`Health check failed: ${healthResponse.status}`)
    }

    const healthResult = await healthResponse.json()
    console.log('✅ Health check successful')
    console.log('   - Status:', healthResult.status)
    console.log('   - Version:', healthResult.version)

    console.log('\n🎉 Cite-sight can successfully integrate with document-lens via direct HTTP!')
    console.log('📊 Processing times: Text:', textResult.processing_time + 's, Academic:', academicResult.processing_time + 's')

    return true

  } catch (error) {
    console.error('❌ Integration test failed:', error.message)
    if (error.message.includes('fetch')) {
      console.error('   Make sure document-lens is running on http://localhost:8002')
    }
    return false
  }
}

async function testCodeLensIntegration() {
  console.log('\n\nTesting direct HTTP integration with code-lens...')

  const testCode = `
def calculate_average(numbers):
    """Calculate the average of a list of numbers."""
    if not numbers:
        return 0
    return sum(numbers) / len(numbers)

# Test the function
data = [1, 2, 3, 4, 5]
result = calculate_average(data)
print(f"Average: {result}")
  `

  try {
    console.log('1. Testing health check...')

    const healthResponse = await fetch('http://localhost:8003/health')
    if (!healthResponse.ok) {
      throw new Error(`Health check failed: ${healthResponse.status}`)
    }

    const healthResult = await healthResponse.json()
    console.log('✅ Code-lens health check successful')
    console.log('   - Status:', healthResult.status)
    console.log('   - App:', healthResult.app)

    console.log('\n2. Testing code analysis...')

    const analysisResponse = await fetch('http://localhost:8003/api/v1/analyze/python', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: testCode,
        language: 'python',
        check_similarity: false,
        run_tests: false
      })
    })

    if (!analysisResponse.ok) {
      throw new Error(`Code analysis failed: ${analysisResponse.status} ${analysisResponse.statusText}`)
    }

    const analysisResult = await analysisResponse.json()
    console.log('✅ Code analysis successful')
    console.log('   - Lines of code:', analysisResult.analysis?.metrics?.lines_of_code || 'N/A')
    console.log('   - Issues found:', analysisResult.analysis?.issues?.length || 0)

    console.log('\n🎉 Applications can successfully integrate with code-lens via direct HTTP!')

    return true

  } catch (error) {
    console.error('❌ Code-lens integration test failed:', error.message)
    if (error.message.includes('fetch')) {
      console.error('   Make sure code-lens is running on http://localhost:8003')
    }
    return false
  }
}

// Run all tests
async function runAllTests() {
  console.log('='.repeat(60))
  console.log('LENS PLATFORM INTEGRATION TESTS')
  console.log('='.repeat(60))

  const documentTest = await testDirectDocumentLensIntegration()
  const codeTest = await testCodeLensIntegration()

  console.log('\n' + '='.repeat(60))
  console.log('SUMMARY')
  console.log('='.repeat(60))
  console.log('Document-lens integration:', documentTest ? '✅ PASS' : '❌ FAIL')
  console.log('Code-lens integration:', codeTest ? '✅ PASS' : '❌ FAIL')

  const overall = documentTest && codeTest
  console.log('Overall result:', overall ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED')

  return overall
}

runAllTests()
  .then(success => {
    console.log('\nExternal applications can integrate with lens services!')
    process.exit(success ? 0 : 1)
  })
  .catch(error => {
    console.error('Test execution failed:', error)
    process.exit(1)
  })