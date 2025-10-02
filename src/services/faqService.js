/**
 * FAQ Service for Monos Trade LLC
 * Handles FAQ data storage, search, and response generation
 */

export class FAQService {
  // Your FAQ data (you can also load this from a database or file)
  static faqData = [
    // Contact Information
    {
      "category": "Contact",
      "question": "What is your main contact email?",
      "answer": "You can contact us at info@monostrade.mn",
      "alt_phrases": ["main email", "contact email", "how can I email you?"],
      "lang": "en"
    },
    {
      "category": "Холбоо барих",
      "question": "Танай имэйл хаяг юу вэ?",
      "answer": "Та info@monostrade.mn хаягаар холбогдож болно.",
      "alt_phrases": ["имэйл", "холбогдох имэйл", "хаана хандъя"],
      "lang": "mn"
    },
    {
      "category": "Contact",
      "question": "What is your main phone number?",
      "answer": "Our main phone number is +976 7766 6688",
      "alt_phrases": ["main phone", "call number", "how can I call you?"],
      "lang": "en"
    },
    {
      "category": "Холбоо барих",
      "question": "Танай утасны дугаар хэд вэ?",
      "answer": "Манай холбогдох утасны дугаар +976 7766 6688.",
      "alt_phrases": ["холбогдох утас", "дугаар", "утас"],
      "lang": "mn"
    },
    {
      "category": "Contact",
      "question": "What is your office address?",
      "answer": "Монгол Улс, Улаанбаатар хот, Баянгол дүүрэг, 3-р хороо, Дунд гол гудамж, Монгол 99 төв, 7 давхар, 706 тоот",
      "alt_phrases": ["office location", "where is your office", "company address"],
      "lang": "en"
    },
    {
      "category": "Хаяг",
      "question": "Танай төв оффис хаана байдаг вэ?",
      "answer": "Манай төв оффис: Монгол Улс, Улаанбаатар хот, Баянгол дүүрэг, 3-р хороо, Дунд гол гудамж, Монгол 99 төв, 7 давхар, 706 тоот.",
      "alt_phrases": ["байршил", "компанийн хаяг", "төв байр"],
      "lang": "mn"
    },
    {
      "category": "Warehouse",
      "question": "Where is your warehouse and logistics center?",
      "answer": "Our warehouse and logistics center: Монгол Улс, Улаанбаатар хот, Баянгол дүүрэг, 20-р хороо, үйлдвэрийн баруун бүс, 44/17. Contact: +976 7777 7080, monostrade@monostrade.mn",
      "alt_phrases": ["warehouse address", "logistics center", "distribution hub"],
      "lang": "en"
    },
    {
      "category": "Агуулах",
      "question": "Агуулах, логистикийн төвийн хаяг хаана вэ?",
      "answer": "Манай агуулах, логистикийн төв: Монгол Улс, Улаанбаатар хот, Баянгол дүүрэг, 20-р хороо, үйлдвэрийн баруун бүс, 44/17. Утас: +976 7777 7080, Имэйл: monostrade@monostrade.mn",
      "alt_phrases": ["агуулах хаана вэ", "логистикийн төвийн хаяг", "хүргэлтийн төв"],
      "lang": "mn"
    },
    {
      "category": "Partnership",
      "question": "Who do I contact for business collaboration?",
      "answer": "For partnership inquiries, please contact saranchimeg@monostrade.mn or bdm1@monostrade.mn, phone: +976 9924 2297, +976 8800 7742",
      "alt_phrases": ["collaborate", "partnership contact", "business cooperation"],
      "lang": "en"
    },
    {
      "category": "Хамтын ажиллагаа",
      "question": "Хамтарч ажиллах талаар хэнтэй холбогдох вэ?",
      "answer": "Хамтын ажиллагааны асуудлаар: saranchimeg@monostrade.mn, bdm1@monostrade.mn, утас: +976 9924 2297, +976 8800 7742",
      "alt_phrases": ["хамтрах", "бизнесийн холбоо", "бизнес хамтын ажиллагаа"],
      "lang": "mn"
    },
    {
      "category": "Safety",
      "question": "How do I report adverse drug reactions or product safety concerns?",
      "answer": "Please contact registration@monostrade.mn for adverse drug reactions and product safety issues.",
      "alt_phrases": ["drug side effects", "report safety issue", "adverse reaction"],
      "lang": "en"
    },
    {
      "category": "Аюулгүй байдал",
      "question": "Эмийн гаж нөлөө эсвэл чанарын асуудлыг хаана мэдээлэх вэ?",
      "answer": "Та registration@monostrade.mn хаягаар эмийн гаж нөлөө болон чанарын асуудлыг мэдээлж болно.",
      "alt_phrases": ["гэж нөлөө", "чанар асуудал", "аюулгүй байдал"],
      "lang": "mn"
    },
    {
      "category": "About",
      "question": "What is Monos Trade LLC?",
      "answer": "Monos Trade LLC, founded in 2017, is a subsidiary of Monos Pharmtrade Group. We import and distribute high-quality medicines, medical devices, laboratory equipment, diagnostics, vaccines, and bioproducts to both public and private healthcare institutions.",
      "alt_phrases": ["tell me about Monos Trade", "company info", "what do you do"],
      "lang": "en"
    },
    {
      "category": "Бидний тухай",
      "question": "Монос Трейд ХХК гэж ямар компани вэ?",
      "answer": "Монос Трейд ХХК нь Монос Фармтрейд группын охин компани бөгөөд 2017 онд байгуулагдсан. Бид эм, эмнэлгийн хэрэгсэл, тоног төхөөрөмж, оношлуур, вакцин, биобэлдмэл зэрэг өндөр чанартай бүтээгдэхүүнийг төрийн болон хувийн хэвшлийн эрүүл мэндийн байгууллагуудад импортлон түгээдэг.",
      "alt_phrases": ["компанийн тухай", "Монос трейд гэж юу вэ", "танай үйл ажиллагаа юу вэ"],
      "lang": "mn"
    },
    {
      "category": "Vision",
      "question": "What is your company vision?",
      "answer": "Our vision is to reduce leading diseases and mortality in Mongolia, provide access to world-class treatment and diagnostics, introduce global healthcare standards locally, and be a leader in implementing international best practices.",
      "alt_phrases": ["mission", "future goals", "long term vision"],
      "lang": "en"
    },
    {
      "category": "Алсын хараа",
      "question": "Танай компанийн алсын хараа юу вэ?",
      "answer": "Монгол хүний эрүүл мэндийг хамгаалж, дэлхийн шилдэг технологи, эмчилгээний стандартыг Монголдоо нэвтрүүлэн, өвчлөл болон нас баралтыг бууруулахад манлайлагч байна.",
      "alt_phrases": ["зорилго", "байгууллагын алсын хараа", "эрхэм зорилго"],
      "lang": "mn"
    },
    {
      "category": "Logistics",
      "question": "How big is your warehouse capacity?",
      "answer": "Our warehouse size is 1248m², following standard MNS 5530:2014, with 14 employees and 4 distribution vehicles (3 normal, 1 refrigerated). We have 24 warehouses across Mongolia, covering all 21 provinces.",
      "alt_phrases": ["warehouse size", "capacity", "distribution vehicles"],
      "lang": "en"
    },
    {
      "category": "Агуулах",
      "question": "Танай агуулахын хэмжээ, хүчин чадал хэд вэ?",
      "answer": "Манай агуулахын хэмжээ 1248м², MNS 5530:2014 стандартад нийцсэн. 14 ажилтантай, 4 түгээлтийн машинтай (3 энгийн, 1 хөргүүртэй). Улсын хэмжээнд нийт 24 агуулахтай, 21 аймгийг хамардаг.",
      "alt_phrases": ["агуулах хүчин чадал", "логистик", "түгээлтийн машин"],
      "lang": "mn"
    },
    {
      "category": "Partners",
      "question": "Which international companies do you work with?",
      "answer": "We cooperate with 300+ global organizations from 40+ countries. Key partners include Roche, AstraZeneca, Novartis, Novo Nordisk, Bayer, Boehringer Ingelheim, Pfizer, and more.",
      "alt_phrases": ["partners", "suppliers", "international companies"],
      "lang": "en"
    },
    {
      "category": "Хамтрагч байгууллага",
      "question": "Танай хамтрагч байгууллагууд хэн бэ?",
      "answer": "Манай компани дэлхийн 40 гаруй орны 300 гаруй байгууллага, Roche, AstraZeneca, Novartis, Novo Nordisk, Bayer, Boehringer Ingelheim, Pfizer зэрэг тэргүүлэгч эмийн үйлдвэрлэгчидтэй хамтран ажилладаг.",
      "alt_phrases": ["хамтрагчид", "нийлүүлэгчид", "олон улсын компани"],
      "lang": "mn"
    }
  ];

  // Tightened intent patterns - each has specific, non-overlapping keywords
  static intentPatterns = {
    contact_email: {
      keywords: ["email", "имэйл", "и-мэйл", "mail", "@", "шуудан"],
      patterns: [
        /имэйл.*хаяг/i,
        /email.*address/i,
        /и-мэйл/i,
        /цахим.*шуудан/i,
        /мэйл.*хаяг/i
      ],
      requiredWords: ["email", "имэйл", "mail", "@"] // Must contain one of these
    },
    contact_phone: {
      keywords: ["phone", "утас", "дугаар", "залгах", "call", "number", "телефон"],
      patterns: [
        /утасны.*дугаар/i,
        /phone.*number/i,
        /дугаар.*хэд/i,
        /залгах.*дугаар/i,
        /telephone/i
      ],
      requiredWords: ["phone", "утас", "дугаар", "call", "залгах"] // Must contain one of these
    },
    office_address: {
      keywords: ["office", "оффис", "байршил", "location", "төв байр"],
      patterns: [
        /оффис.*хаана/i,
        /office.*address/i,
        /office.*location/i,
        /төв.*байр/i,
        /байршил/i
      ],
      requiredWords: ["office", "оффис", "байршил", "location"] // Must contain one of these
    },
    warehouse_address: {
      keywords: ["warehouse", "агуулах", "склад", "логистик", "logistics", "distribution"],
      patterns: [
        /агуулах.*хаана/i,
        /warehouse.*address/i,
        /логистик.*төв/i,
        /склад/i
      ],
      requiredWords: ["warehouse", "агуулах", "склад", "логистик"] // Must contain one of these
    },
    company_info: {
      keywords: ["company", "компани", "what do you do", "юу хийдэг", "business", "organization"],
      patterns: [
        /what.*do.*you.*do/i,
        /компани.*гэж.*юу/i,
        /юу.*хийдэг/i,
        /tell.*about.*company/i,
        /what.*is.*monos/i
      ],
      requiredWords: ["company", "компани", "business", "монос"]
    },
    partnership: {
      keywords: ["partnership", "хамтран", "collaborate", "cooperation", "бизнес"],
      patterns: [
        /хамтарч.*ажиллах/i,
        /partnership/i,
        /collaborate/i,
        /cooperation/i,
        /бизнес.*хамтын/i
      ],
      requiredWords: ["partnership", "хамтран", "collaborate", "cooperation"]
    }
  };

  // Forbidden topics that must be blocked immediately
  static forbiddenTopics = {
    medical_advice: [
      // English medical terms
      "what medicine", "recommend prescription", "can you recommend", "side effects", "drug interaction", 
      "medical advice", "diagnosis", "treatment", "symptoms", "what should i take",
      "medicine for", "drug for", "cure for", "treat my", "help with pain",
      "prescribe", "medication", "pills for", "therapy", "remedy", "recommend a prescription",
      // Mongolian medical terms
      "эм санал болгох", "эмчилгээ", "гаж нөлөө", "тун хэмжээ", "оношлуур", 
      "шинж тэмдэг", "өвдөж байна", "эм авах", "эмчид хандах", "эмийн зааварчилгаа"
    ],
    general_topics: [
      // Non-company topics
      "weather", "цаг агаар", "politics", "улс төр", "sports", "спорт", 
      "news", "мэдээ", "entertainment", "зугаа цэнгэл", "cooking", "хоол",
      "travel", "аялал", "personal problems", "хувийн асуудал",
      "what's happening", "юу болж байна", "current events", "сонин мэдээ"
    ],
    competitors: [
      "other pharmacy", "бусад эмийн сан", "competitor", "өрсөлдөгч", 
      "alternative supplier", "өөр нийлүүлэгч", "different company", "өөр компани"
    ]
  };

  /**
   * Search for FAQ matches based on user question
   */
  static searchFAQ(question, language = 'auto') {
    const normalizedQuestion = question.toLowerCase().trim();
    
    // 🚨 STEP 1: Check forbidden topics FIRST (critical safety check)
    const forbiddenCheck = this.checkForbiddenTopics(normalizedQuestion);
    if (forbiddenCheck.isForbidden) {
      return {
        found: false,
        confidence: 0,
        reason: 'forbidden_topic',
        topicType: forbiddenCheck.type,
        blockReason: forbiddenCheck.reason
      };
    }

    // 🔍 STEP 2: Direct question matching (highest priority)
    const exactMatch = this.faqData.find(faq => 
      faq.question.toLowerCase() === normalizedQuestion ||
      faq.alt_phrases.some(phrase => 
        normalizedQuestion.includes(phrase.toLowerCase()) ||
        phrase.toLowerCase().includes(normalizedQuestion)
      )
    );

    if (exactMatch) {
      return {
        found: true,
        answer: exactMatch.answer,
        confidence: 1.0,
        category: exactMatch.category,
        matchType: 'exact'
      };
    }

    // 🎯 STEP 3: Intent-based matching with strict requirements
    const intentMatch = this.findIntentMatch(normalizedQuestion);
    if (intentMatch && intentMatch.confidence >= 0.7) {
      return intentMatch;
    }

    // 📊 STEP 4: Keyword-based fuzzy matching with higher threshold
    const keywordMatch = this.findKeywordMatch(normalizedQuestion);
    if (keywordMatch && keywordMatch.confidence >= 0.7) {
      return keywordMatch;
    }

    // ❌ No reliable match found
    return {
      found: false,
      confidence: keywordMatch ? keywordMatch.confidence : 0,
      reason: 'confidence_too_low',
      suggestedMatch: keywordMatch || null
    };
  }

  /**
   * Check forbidden topics FIRST before any matching
   */
  static checkForbiddenTopics(question) {
    const lowerQuestion = question.toLowerCase();

    // Check medical advice (highest priority block)
    for (const medicalTerm of this.forbiddenTopics.medical_advice) {
      if (lowerQuestion.includes(medicalTerm.toLowerCase())) {
        return {
          isForbidden: true,
          type: 'medical_advice',
          reason: `Detected medical advice request: "${medicalTerm}"`,
          matchedTerm: medicalTerm
        };
      }
    }

    // Check general non-company topics
    for (const generalTerm of this.forbiddenTopics.general_topics) {
      if (lowerQuestion.includes(generalTerm.toLowerCase())) {
        return {
          isForbidden: true,
          type: 'general_topics',
          reason: `Detected out-of-scope topic: "${generalTerm}"`,
          matchedTerm: generalTerm
        };
      }
    }

    // Check competitor topics
    for (const competitorTerm of this.forbiddenTopics.competitors) {
      if (lowerQuestion.includes(competitorTerm.toLowerCase())) {
        return {
          isForbidden: true,
          type: 'competitors',
          reason: `Detected competitor inquiry: "${competitorTerm}"`,
          matchedTerm: competitorTerm
        };
      }
    }

    return { isForbidden: false };
  }

  /**
   * Find matches based on intent patterns with strict validation
   */
  static findIntentMatch(question) {
    for (const [intent, config] of Object.entries(this.intentPatterns)) {
      // NEW: Check required words first (must have at least one)
      const hasRequiredWord = config.requiredWords && 
        config.requiredWords.some(word => 
          question.includes(word.toLowerCase())
        );

      if (!hasRequiredWord) {
        continue; // Skip this intent if no required words found
      }

      // Check pattern matches with higher confidence
      for (const pattern of config.patterns) {
        if (pattern.test(question)) {
          const faqMatch = this.faqData.find(faq => 
            this.matchesIntent(faq, intent)
          );
          
          if (faqMatch) {
            return {
              found: true,
              answer: faqMatch.answer,
              confidence: 0.95, // Higher confidence for pattern matches
              category: faqMatch.category,
              matchType: 'intent_pattern',
              intent: intent
            };
          }
        }
      }

      // Check keyword matches (only if required words present)
      const keywordMatches = config.keywords.filter(keyword => 
        question.includes(keyword.toLowerCase())
      );

      if (keywordMatches.length >= 2) { // Require at least 2 keyword matches
        const faqMatch = this.faqData.find(faq => 
          this.matchesIntent(faq, intent)
        );
        
        if (faqMatch) {
          return {
            found: true,
            answer: faqMatch.answer,
            confidence: 0.8, // Medium confidence for keyword matches
            category: faqMatch.category,
            matchType: 'intent_keywords',
            intent: intent,
            matchedKeywords: keywordMatches
          };
        }
      }
    }

    return null;
  }

  /**
   * Check if FAQ matches intent with STRICT category mapping
   */
  static matchesIntent(faq, intent) {
    // NEW: Much more specific intent to category mapping
    const strictIntentMappings = {
      contact_email: {
        allowedCategories: ['Contact', 'Холбоо барих'],
        requiredInAnswer: ['@', 'info@monostrade.mn', 'email', 'имэйл'] // Must contain email reference
      },
      contact_phone: {
        allowedCategories: ['Contact', 'Холбоо барих'],
        requiredInAnswer: ['+976 7766 6688', 'phone', 'утас', 'дугаар'] // Must contain phone reference
      },
      office_address: {
        allowedCategories: ['Contact', 'Хаяг'],
        requiredInAnswer: ['99 төв', 'оффис', 'office', 'Баянгол дүүрэг'] // Must contain office reference
      },
      warehouse_address: {
        allowedCategories: ['Warehouse', 'Агуулах'],
        requiredInAnswer: ['агуулах', 'warehouse', '20-р хороо', 'логистик'] // Must contain warehouse reference
      },
      company_info: {
        allowedCategories: ['About', 'Бидний тухай'],
        requiredInAnswer: ['Monos Trade', 'Монос Трейд', '2017', 'импорт', 'import']
      },
      partnership: {
        allowedCategories: ['Partnership', 'Хамтын ажиллагаа'],
        requiredInAnswer: ['saranchimeg@', 'bdm1@', 'хамтын ажиллагаа', 'partnership']
      }
    };

    const mapping = strictIntentMappings[intent];
    if (!mapping) return false;

    // Check if FAQ category matches
    const categoryMatches = mapping.allowedCategories.some(cat => 
      faq.category === cat
    );

    if (!categoryMatches) return false;

    // Check if answer contains required terms (prevents wrong answers)
    const answerContainsRequired = mapping.requiredInAnswer.some(term =>
      faq.answer.toLowerCase().includes(term.toLowerCase())
    );

    return answerContainsRequired;
  }

  /**
   * Find matches based on keywords
   */
  static findKeywordMatch(question) {
    let bestMatch = null;
    let bestScore = 0;

    for (const faq of this.faqData) {
      const score = this.calculateSimilarity(question, faq);
      if (score > bestScore && score > 0.3) {
        bestScore = score;
        bestMatch = faq;
      }
    }

    if (bestMatch) {
      return {
        found: true,
        answer: bestMatch.answer,
        confidence: bestScore,
        category: bestMatch.category,
        matchType: 'similarity'
      };
    }

    return null;
  }

  /**
   * Calculate similarity between question and FAQ
   */
  static calculateSimilarity(question, faq) {
    const questionWords = question.toLowerCase().split(/\s+/);
    const faqWords = [
      ...faq.question.toLowerCase().split(/\s+/),
      ...faq.alt_phrases.join(' ').toLowerCase().split(/\s+/)
    ];

    const commonWords = questionWords.filter(word => 
      faqWords.some(faqWord => 
        faqWord.includes(word) || word.includes(faqWord)
      )
    );

    return commonWords.length / Math.max(questionWords.length, 1);
  }

  /**
   * Check if question is about medical advice (enhanced version)
   */
  static isMedicalAdviceQuestion(question) {
    const forbiddenCheck = this.checkForbiddenTopics(question);
    return forbiddenCheck.isForbidden && forbiddenCheck.type === 'medical_advice';
  }

  /**
   * Check if question is outside company scope (enhanced version)
   */
  static isOutOfScope(question) {
    const forbiddenCheck = this.checkForbiddenTopics(question);
    return forbiddenCheck.isForbidden && 
           (forbiddenCheck.type === 'general_topics' || forbiddenCheck.type === 'competitors');
  }

  /**
   * Generate precise fallback response based on forbidden topic type
   */
  static generateFallbackResponse(question, language = 'mn') {
    const forbiddenCheck = this.checkForbiddenTopics(question);
    
    if (forbiddenCheck.isForbidden) {
      switch (forbiddenCheck.type) {
        case 'medical_advice':
          return language === 'en' 
            ? "I cannot provide medical advice, prescriptions, or health consultations. Please consult with a qualified healthcare professional or doctor."
            : "Уучлаарай, би эмчилгээний зөвлөгөө өгөх боломжгүй. Та эмчид хандана уу.";
            
        case 'general_topics':
          return language === 'en'
            ? "I can only provide information about Monos Trade LLC. For other topics, please contact our customer service at +976 7766 6688."
            : "Би зөвхөн Монос Трейд ХХК-ийн үйл ажиллагаа болон бүтээгдэхүүний талаар мэдээлэл өгнө. Харилцагчийн үйлчилгээтэй холбогдоно уу: +976 7766 6688";
            
        case 'competitors':
          return language === 'en'
            ? "I can only provide information about Monos Trade LLC services. For general inquiries, please contact +976 7766 6688."
            : "Би зөвхөн Монос Трейд ХХК-ийн үйлчилгээний талаар мэдээлэл өгч чадна. Бусад асуудлаар +976 7766 6688 руу холбогдоно уу.";
      }
    }

    // General fallback for low confidence matches
    return language === 'en'
      ? "I don't have specific information about that topic. Please contact our customer service at +976 7766 6688 or email info@monostrade.mn for assistance."
      : "Энэ асуудлын талаар тодорхой мэдээлэл байхгүй байна. Харилцагчийн үйлчилгээтэй холбогдоно уу: +976 7766 6688 эсвэл info@monostrade.mn хаягаар и-мэйл бичнэ үү.";
  }

  /**
   * Get all FAQ categories
   */
  static getCategories() {
    return [...new Set(this.faqData.map(faq => faq.category))];
  }

  /**
   * Get FAQs by category
   */
  static getFAQsByCategory(category) {
    return this.faqData.filter(faq => 
      faq.category.toLowerCase() === category.toLowerCase()
    );
  }
}

export default FAQService;
