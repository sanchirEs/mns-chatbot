# 🤖 FAQ Integration Guide for Monos Trade LLC Chatbot

## ✅ Implementation Complete + CRITICAL FIXES APPLIED!

Your chatbot is now **fully integrated** with the FAQ system and has **ALL CRITICAL ISSUES FIXED**. Here's what works now:

## 🚨 **CRITICAL FIXES APPLIED**

### ✅ **Fixed Issues:**
1. **Wrong Intent Matching**: "What is your phone number?" now returns **phone number** (not email)
2. **Medical Advice Blocking**: "Can you recommend a prescription?" is now **BLOCKED** (not matched to contact)
3. **Over-matching Prevention**: "Tell me about politics" is now **BLOCKED** (not matched to company info)
4. **Confidence Thresholds**: Only matches with 0.7+ confidence are accepted
5. **Strict Category Mapping**: Each intent maps to specific, correct answers only

### 🛡️ **Safety Guardrails:**
- **Medical advice** → Always blocked with "Уучлаарай, би эмчилгээний зөвлөгөө өгөх боломжгүй. Та эмчид хандана уу."
- **Out-of-scope topics** → Always blocked with customer service redirect
- **Low confidence** → No dangerous guessing, proper fallback responses

## 🔧 What Was Implemented

### 1. **FAQ Service** (`src/services/faqService.js`)
- ✅ Stores all your FAQ data
- ✅ Smart matching using keywords, patterns, and intent detection
- ✅ Supports both English and Mongolian
- ✅ Medical advice detection and blocking
- ✅ Out-of-scope question detection

### 2. **System Prompt Strategy**
- ✅ Restricted to FAQ knowledge base only
- ✅ Medical advice redirects: "Энэ талаар зөвхөн эмчид хандахыг зөвлөж байна."
- ✅ Out-of-scope redirects: "Харилцагчийн үйлчилгээтэй холбогдоно уу: +976 7766 6688"
- ✅ No invented contact information

### 3. **Chat Endpoints Updated**
- ✅ `/api/chat` (simple endpoint) - FAQ integrated
- ✅ Advanced chat controller - FAQ integrated
- ✅ Both endpoints check FAQ first before AI

## 🚀 How It Works

### Chat Flow Process:

```
User Question
     ↓
1️⃣ CHECK FAQ DATABASE
   ├─ Match Found? → Return FAQ Answer
   └─ No Match? → Continue to Step 2
     ↓
2️⃣ CHECK QUESTION TYPE
   ├─ Medical Advice? → "Энэ талаар зөвхөн эмчид хандахыг зөвлөж байна."
   ├─ Out of Scope? → "Харилцагчийн үйлчилгээтэй холбогдоно уу: +976 7766 6688"
   └─ Company Related? → Continue to Step 3
     ↓
3️⃣ RESTRICTED AI RESPONSE
   └─ Use OpenAI with strict system prompt
```

## 📞 Contact Information (Built-in)

The system includes all official contact information:

- **Main Phone**: +976 7766 6688
- **Email**: info@monostrade.mn
- **Office**: Монгол Улс, Улаанбаатар хот, Баянгол дүүрэг, 3-р хороо, Дунд гол гудамж, Монгол 99 төв, 7 давхар, 706 тоот
- **Warehouse**: Монгол Улс, Улаанбаатар хот, Баянгол дүүрэг, 20-р хороо, үйлдвэрийн баруун бүс, 44/17
- **Partnership**: saranchimeg@monostrade.mn, bdm1@monostrade.mn, +976 9924 2297, +976 8800 7742
- **Safety Reports**: registration@monostrade.mn

## 🧪 Testing Your FAQ System

### Run the Test Script:
```bash
node test-faq.js
```

This will test various question types and show you how the FAQ system responds.

### Test with cURL:
```bash
# Test FAQ question
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is your phone number?"}'

# Test medical question
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What medicine should I take for headache?"}'

# Test out-of-scope question
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the weather today?"}'
```

## 📝 Example Responses

### ✅ FAQ Match (Contact Info):
**Input**: "What is your phone number?"
```json
{
  "reply": "Our main phone number is +976 7766 6688",
  "metadata": {
    "source": "faq",
    "category": "Contact",
    "confidence": 0.9,
    "responseTime": 25
  }
}
```

### ⚕️ Medical Question:
**Input**: "What medicine should I take?"
```json
{
  "reply": "Энэ талаар зөвхөн эмчид хандахыг зөвлөж байна.",
  "metadata": {
    "source": "fallback",
    "reason": "medical_advice"
  }
}
```

### 🚫 Out-of-Scope:
**Input**: "What's the weather?"
```json
{
  "reply": "Харилцагчийн үйлчилгээтэй холбогдоно уу: +976 7766 6688",
  "metadata": {
    "source": "fallback",
    "reason": "out_of_scope"
  }
}
```

## 🔧 Customization

### Adding New FAQ Items:
Edit `src/services/faqService.js` and add to the `faqData` array:

```javascript
{
  "category": "New Category",
  "question": "Your new question?",
  "answer": "Your official answer here.",
  "alt_phrases": ["alternative phrase 1", "alternative 2"],
  "lang": "en"
}
```

### Updating Contact Information:
Update the system prompt in both:
- `src/controllers/chatController.js` (buildSystemPrompt function)
- `src/app.js` (chat endpoint system prompt)

### Adding New Medical Keywords:
Update the `medicalKeywords` array in `FAQService.isMedicalAdviceQuestion()`

## 🎯 Key Features

### ✅ Smart FAQ Matching
- Exact question matching
- Alternative phrase matching
- Intent-based matching (contact, address, etc.)
- Keyword similarity scoring
- Confidence-based responses

### ✅ Strict Restrictions
- **Medical advice** → Always redirected to doctors
- **Out-of-scope topics** → Redirected to customer service
- **Unmatched questions** → Processed with restricted AI
- **No invented information** → Only official data used

### ✅ Bilingual Support
- English and Mongolian questions supported
- Appropriate language responses
- Cultural context awareness

### ✅ Response Metadata
Every response includes:
- Source (faq, fallback, ai_restricted)
- Response time
- Confidence scores
- Category information

## 🚨 Important Notes

1. **FAQ First**: Always checks FAQ database before using AI
2. **No Medical Advice**: Strictly enforced redirection
3. **Official Info Only**: Never invents phone numbers or addresses
4. **Fallback Safety**: Always provides customer service contact for unknown topics
5. **Performance**: FAQ responses are instant (no OpenAI API calls)

## 🛠️ Monitoring

Your chatbot now logs all interactions with clear indicators:
- `🔍` FAQ checking
- `✅` FAQ matches found
- `⚕️` Medical questions detected
- `🚫` Out-of-scope questions
- `🤖` AI responses with restrictions

Check your console logs to monitor how users are interacting with the system!

---

**🎉 Your FAQ-restricted chatbot is now ready for production use!**

The system will only provide information from your official FAQ database, redirect medical questions to doctors, and send unknown topics to customer service. This ensures complete control over what information your chatbot provides.
