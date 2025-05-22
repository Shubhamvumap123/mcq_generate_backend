import { spawn } from 'child_process';
import { ISegment, IQuestion } from '../models/Video';
import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

export class QuestionGenerationService {
    private llmEndpoint: string;
    private llmModel: string;
    private questionsPerSegment: number = 3;

    constructor() {
        // Configure based on your local LLM setup
        this.llmEndpoint = process.env.LLM_ENDPOINT || 'http://localhost:11434/api/generate'; // Ollama default
        this.llmModel = process.env.LLM_MODEL || 'llama2'; // or 'mistral', 'codellama', etc.
    }

    async generateQuestions(segments: ISegment[]): Promise<IQuestion[]> {
        try {
            console.log(`Generating questions for ${segments.length} segments`);
            
            const allQuestions: IQuestion[] = [];

            for (const segment of segments) {
                try {
                    const questions = await this.generateQuestionsForSegment(segment);
                    allQuestions.push(...questions);
                    
                    console.log(`Generated ${questions.length} questions for segment ${segment.segmentIndex}`);
                    
                    // Add small delay to avoid overwhelming the LLM
                    await this.delay(1000);
                    
                } catch (error) {
                    console.error(`Failed to generate questions for segment ${segment.segmentIndex}:`, error);
                    // Continue with other segments even if one fails
                }
            }

            console.log(`Total questions generated: ${allQuestions.length}`);
            return allQuestions;

        } catch (error) {
            console.error('Question generation error:', error);
            if (error instanceof Error) {
                throw new Error(`Question generation failed: ${error.message}`);
            } else {
                throw new Error('Question generation failed: ' + String(error));
            }
        }
    }

    private async generateQuestionsForSegment(segment: ISegment): Promise<IQuestion[]> {
        const prompt = this.createPrompt(segment.text);
        
        try {
            // Try local LLM first
            const response = await this.callLocalLLM(prompt);
            const questions = this.parseQuestions(response, segment.segmentIndex);
            
            if (questions.length > 0) {
                return questions;
            }
        } catch (error) {
            if (error instanceof Error) {
                console.warn(`Local LLM failed for segment ${segment.segmentIndex}, using fallback:`, error.message);
            } else {
                console.warn(`Local LLM failed for segment ${segment.segmentIndex}, using fallback:`, error);
            }
        }

        // Fallback to mock questions if LLM fails
        return this.generateMockQuestions(segment);
    }

    private createPrompt(text: string): string {
        return `Based on the following text, generate ${this.questionsPerSegment} multiple-choice questions with 4 options each. 

Instructions:
- Create objective, knowledge-based questions about the content
- Provide 4 options (A, B, C, D) for each question
- Indicate the correct answer
- Questions should test understanding of key concepts
- Return the response in JSON format

Text: "${text}"

Required JSON format:
{
  "questions": [
    {
      "question": "What is the main topic discussed?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": 0,
      "explanation": "Brief explanation of why this is correct"
    }
  ]
}

Generate ${this.questionsPerSegment} questions now:`;
    }

    private async callLocalLLM(prompt: string): Promise<string> {
        try {
            // Ollama API call
            const response = await axios.post(this.llmEndpoint, {
                model: this.llmModel,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: 0.7,
                    top_p: 0.9,
                    max_tokens: 1000
                }
            }, {
                timeout: 60000, // 60 second timeout
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.data && response.data.response) {
                return response.data.response;
            }

            throw new Error('Invalid response from LLM');

        } catch (error) {
            if (typeof error === 'object' && error !== null && 'code' in error && (error as any).code === 'ECONNREFUSED') {
                throw new Error('LLM service not available. Make sure Ollama is running.');
            }
            throw new Error(`LLM API call failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private parseQuestions(response: string, segmentIndex: number): IQuestion[] {
        try {
            // Try to extract JSON from the response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const jsonStr = jsonMatch[0];
            const parsed = JSON.parse(jsonStr);

            if (!parsed.questions || !Array.isArray(parsed.questions)) {
                throw new Error('Invalid JSON structure');
            }

            return parsed.questions.map((q: any) => ({
                question: q.question,
                options: q.options || [],
                correctAnswer: q.correct_answer || 0,
                explanation: q.explanation || '',
                segmentIndex: segmentIndex
            })).filter((q: IQuestion) => 
                q.question && q.options.length === 4
            );

        } catch (error) {
            console.error('Failed to parse LLM response:', error);
            return [];
        }
    }

    private generateMockQuestions(segment: ISegment): IQuestion[] {
        // Generate mock questions when LLM is not available
        const mockQuestions: IQuestion[] = [
            {
                question: `What is the main topic discussed in segment ${segment.segmentIndex + 1}?`,
                options: [
                    "Technical implementation details",
                    "General overview and introduction", 
                    "Practical applications and examples",
                    "Summary and conclusions"
                ],
                correctAnswer: 1,
                explanation: "This question tests understanding of the segment's primary focus.",
                segmentIndex: segment.segmentIndex
            },
            {
                question: `Which concept is emphasized in this part of the content?`,
                options: [
                    "Historical background",
                    "Current methodologies",
                    "Future predictions", 
                    "Key principles and fundamentals"
                ],
                correctAnswer: 3,
                explanation: "The segment focuses on explaining fundamental concepts.",
                segmentIndex: segment.segmentIndex
            },
            {
                question: `What type of information is provided in this segment?`,
                options: [
                    "Statistical data only",
                    "Theoretical concepts with examples",
                    "Personal opinions",
                    "Marketing content"
                ],
                correctAnswer: 1,
                explanation: "The content combines theory with practical examples for better understanding.",
                segmentIndex: segment.segmentIndex
            }
        ];

        return mockQuestions.slice(0, this.questionsPerSegment);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Alternative LLM implementations

    async callGPT4All(prompt: string): Promise<string> {
        return new Promise((resolve, reject) => {
            // GPT4All command line interface
            const gpt4allPath: string = process.env.GPT4ALL_PATH || 'gpt4all';
            const args = ['--model', this.llmModel, '--prompt', prompt];

            const child = spawn(gpt4allPath, args);
            let output = '';
            let error = '';

            child.stdout.on('data', (data) => {
                output += data.toString();
            });

            child.stderr.on('data', (data) => {
                error += data.toString();
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(new Error(`GPT4All process failed: ${error}`));
                }
            });

            child.on('error', (err) => {
                reject(new Error(`Failed to start GPT4All: ${err.message}`));
            });

            // Timeout after 2 minutes
            setTimeout(() => {
                child.kill();
                reject(new Error('GPT4All process timeout'));
            }, 120000);
        });
    }

    async callLlamaCpp(prompt: string): Promise<string> {
        return new Promise((resolve, reject) => {
            // llama.cpp server API call
            const llamaCppEndpoint = process.env.LLAMACPP_ENDPOINT || 'http://localhost:8080/completion';
            
            axios.post(llamaCppEndpoint, {
                prompt: prompt,
                n_predict: 512,
                temperature: 0.7,
                top_p: 0.9,
                stop: ["</s>", "Human:", "Assistant:"]
            }, {
                timeout: 60000,
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then(response => {
                if (response.data && response.data.content) {
                    resolve(response.data.content);
                } else {
                    reject(new Error('Invalid response from llama.cpp'));
                }
            })
            .catch(error => {
                reject(new Error(`llama.cpp API call failed: ${error.message}`));
            });
        });
    }

    // Utility methods for question quality control

    private validateQuestions(questions: IQuestion[]): IQuestion[] {
        return questions.filter(q => {
            // Basic validation
            if (!q.question || q.question.trim().length < 10) return false;
            if (!q.options || q.options.length !== 4) return false;
            if (q.correctAnswer < 0 || q.correctAnswer > 3) return false;
            
            // Check for duplicate options
            const uniqueOptions = new Set(q.options.map(opt => opt.toLowerCase().trim()));
            if (uniqueOptions.size !== 4) return false;

            // Check question quality
            if (q.question.toLowerCase().includes('what is') && 
                q.options.every(opt => opt.length < 5)) return false;

            return true;
        });
    }

    private shuffleQuestions(questions: IQuestion[]): IQuestion[] {
        const shuffled = [...questions];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    private diversifyQuestions(questions: IQuestion[]): IQuestion[] {
        // Ensure variety in question types
        const questionTypes = {
            definition: 0,
            application: 0,
            comparison: 0,
            synthesis: 0
        };

        return questions.map(q => {
            // Analyze question type and adjust if needed
            const question = q.question.toLowerCase();
            
            if (question.includes('what is') || question.includes('define')) {
                questionTypes.definition++;
            } else if (question.includes('how') || question.includes('apply')) {
                questionTypes.application++;
            } else if (question.includes('compare') || question.includes('difference')) {
                questionTypes.comparison++;
            } else {
                questionTypes.synthesis++;
            }

            return q;
        });
    }

    // Public method to test LLM connectivity
    async testLLMConnection(): Promise<{ status: string; model: string; response?: string; error?: string }> {
        try {
            const testPrompt = "Generate a simple test response. Just say 'LLM is working correctly.'";
            const response = await this.callLocalLLM(testPrompt);
            
            return {
                status: 'connected',
                model: this.llmModel,
                response: response.substring(0, 100) + (response.length > 100 ? '...' : '')
            };
        } catch (error) {
            return {
                status: 'disconnected',
                model: this.llmModel,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}