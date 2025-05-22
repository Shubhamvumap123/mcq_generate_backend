import { JsonController, Get, Post, Put, Delete, Param, Body, QueryParam } from 'routing-controllers';
import { Video, IQuestion } from '../models/Video';
import { QuestionGenerationService } from '../services/QuestionGenerationService';

interface QuizAnswer {
    questionIndex: number;
    selectedAnswer: number;
}

interface QuizSubmission {
    videoId: string;
    answers: QuizAnswer[];
}

interface QuizResult {
    score: number;
    totalQuestions: number;
    percentage: number;
    answers: {
        questionIndex: number;
        question: string;
        selectedAnswer: number;
        correctAnswer: number;
        isCorrect: boolean;
        explanation: string;
    }[];
}

@JsonController('/api/questions')
export class QuestionController {
    private questionService = new QuestionGenerationService();

    @Get('/:videoId')
    async getQuestions(
        @Param('videoId') videoId: string,
        @QueryParam('segmentIndex') segmentIndex?: number,
        @QueryParam('limit') limit?: number,
        @QueryParam('shuffle') shuffle: boolean = false
    ): Promise<{
        questions: IQuestion[];
        totalQuestions: number;
        segmentIndex?: number;
    }> {
        try {
            const video = await Video.findById(videoId);
            if (!video) {
                throw new Error('Video not found');
            }

            let questions = video.questions || [];

            // Filter by segment if specified
            if (segmentIndex !== undefined) {
                questions = questions.filter(q => q.segmentIndex === segmentIndex);
            }

            // Shuffle questions if requested
            if (shuffle) {
                questions = this.shuffleArray([...questions]);
            }

            // Limit results if specified
            if (limit && limit > 0) {
                questions = questions.slice(0, limit);
            }

            return {
                questions,
                totalQuestions: questions.length,
                segmentIndex
            };
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to fetch questions: ${error.message}`);
            } else {
                throw new Error('Failed to fetch questions: ' + String(error));
            }
        }
    }

    @Get('/:videoId/segments/:segmentIndex')
    async getQuestionsBySegment(
        @Param('videoId') videoId: string,
        @Param('segmentIndex') segmentIndex: number
    ): Promise<{
        questions: IQuestion[];
        segmentIndex: number;
        segmentText?: string;
    }> {
        try {
            const video = await Video.findById(videoId);
            if (!video) {
                throw new Error('Video not found');
            }

            const questions = video.questions?.filter(q => q.segmentIndex === segmentIndex) || [];
            const segment = video.segments?.find(s => s.segmentIndex === segmentIndex);

            return {
                questions,
                segmentIndex,
                segmentText: segment?.text
            };
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to fetch questions for segment: ${error.message}`);
            } else {
                throw new Error('Failed to fetch questions for segment: ' + String(error));
            }
        }
    }

    @Get('/:videoId/quiz')
    async generateQuiz(
        @Param('videoId') videoId: string,
        @QueryParam('questionsPerSegment') questionsPerSegment: number = 2,
        @QueryParam('totalQuestions') totalQuestions?: number,
        @QueryParam('shuffle') shuffle: boolean = true
    ): Promise<{
        quizId: string;
        questions: (IQuestion & { questionIndex: number })[];
        totalQuestions: number;
        instructions: string;
    }> {
        try {
            const video = await Video.findById(videoId);
            if (!video) {
                throw new Error('Video not found');
            }

            if (!video.questions || video.questions.length === 0) {
                throw new Error('No questions available for this video');
            }

            let selectedQuestions: IQuestion[] = [];

            if (totalQuestions) {
                // Select total number of questions randomly
                const shuffled = this.shuffleArray([...video.questions]);
                selectedQuestions = shuffled.slice(0, totalQuestions);
            } else {
                // Select questions per segment
                const segmentIndices = [...new Set(video.questions.map(q => q.segmentIndex))];
                
                for (const segmentIndex of segmentIndices) {
                    const segmentQuestions = video.questions.filter(q => q.segmentIndex === segmentIndex);
                    const shuffled = this.shuffleArray([...segmentQuestions]);
                    selectedQuestions.push(...shuffled.slice(0, questionsPerSegment));
                }
            }

            if (shuffle) {
                selectedQuestions = this.shuffleArray(selectedQuestions);
            }

            // Add question indices for tracking
            const questionsWithIndices = selectedQuestions.map((q, index) => ({
                ...q,
                questionIndex: index
            }));

            const quizId = `${videoId}_${Date.now()}`;

            return {
                quizId,
                questions: questionsWithIndices,
                totalQuestions: selectedQuestions.length,
                instructions: "Select the best answer for each question. Click 'Submit Quiz' when you're done."
            };
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to generate quiz: ${error.message}`);
            } else {
                throw new Error('Failed to generate quiz: ' + String(error));
            }
        }
    }

    @Post('/quiz/submit')
    async submitQuiz(@Body() submission: QuizSubmission): Promise<QuizResult> {
        try {
            const video = await Video.findById(submission.videoId);
            if (!video) {
                throw new Error('Video not found');
            }

            if (!video.questions || video.questions.length === 0) {
                throw new Error('No questions available for grading');
            }

            const results: QuizResult['answers'] = [];
            let correctAnswers = 0;

            for (const answer of submission.answers) {
                // Find the question by matching content (since we don't store question IDs)
                const question = video.questions[answer.questionIndex];
                
                if (question) {
                    const isCorrect = answer.selectedAnswer === question.correctAnswer;
                    if (isCorrect) correctAnswers++;

                    results.push({
                        questionIndex: answer.questionIndex,
                        question: question.question,
                        selectedAnswer: answer.selectedAnswer,
                        correctAnswer: question.correctAnswer,
                        isCorrect,
                        explanation: question.explanation || 'No explanation provided'
                    });
                }
            }

            const totalQuestions = submission.answers.length;
            const percentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

            return {
                score: correctAnswers,
                totalQuestions,
                percentage,
                answers: results
            };
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to submit quiz: ${error.message}`);
            } else {
                throw new Error('Failed to submit quiz: ' + String(error));
            }
        }
    }

    @Post('/:videoId/regenerate')
    async regenerateQuestions(
        @Param('videoId') videoId: string,
        @Body() options: {
            segmentIndex?: number;
            questionsPerSegment?: number;
        } = {}
    ): Promise<{ message: string; questionsGenerated: number }> {
        try {
            const video = await Video.findById(videoId);
            if (!video) {
                throw new Error('Video not found');
            }

            if (!video.segments || video.segments.length === 0) {
                throw new Error('No transcript segments available');
            }

            // Set status to processing
            video.questionGenerationStatus = 'processing';
            await video.save();

            let segmentsToProcess = video.segments;

            // If specific segment requested, filter
            if (options.segmentIndex !== undefined) {
                segmentsToProcess = video.segments.filter(s => s.segmentIndex === options.segmentIndex);
                if (segmentsToProcess.length === 0) {
                    throw new Error('Segment not found');
                }
            }

            // Generate new questions
            const newQuestions = await this.questionService.generateQuestions(segmentsToProcess);

            if (options.segmentIndex !== undefined) {
                // Replace questions for specific segment
                video.questions = video.questions?.filter(q => q.segmentIndex !== options.segmentIndex) || [];
                video.questions.push(...newQuestions);
            } else {
                // Replace all questions
                video.questions = newQuestions;
            }

            video.questionGenerationStatus = 'completed';
            video.questionGenerationError = undefined;
            await video.save();

            return {
                message: 'Questions regenerated successfully',
                questionsGenerated: newQuestions.length
            };
        } catch (error) {
            // Update status on error
            try {
                const video = await Video.findById(videoId);
                if (video) {
                    video.questionGenerationStatus = 'failed';
                    video.questionGenerationError = error instanceof Error ? error.message : String(error);
                    await video.save();
                }
            } catch (updateError) {
                console.error('Failed to update error status:', updateError);
            }

            if (error instanceof Error) {
                throw new Error(`Failed to regenerate questions: ${error.message}`);
            } else {
                throw new Error('Failed to regenerate questions: Unknown error');
            }
        }
    }

    @Put('/:videoId/questions/:questionIndex')
    async updateQuestion(
        @Param('videoId') videoId: string,
        @Param('questionIndex') questionIndex: number,
        @Body() updatedQuestion: Partial<IQuestion>
    ): Promise<{ message: string; question: IQuestion }> {
        try {
            const video = await Video.findById(videoId);
            if (!video) {
                throw new Error('Video not found');
            }

            if (!video.questions || questionIndex >= video.questions.length) {
                throw new Error('Question not found');
            }

            // Update the question
            const question = video.questions[questionIndex];
            if (updatedQuestion.question) question.question = updatedQuestion.question;
            if (updatedQuestion.options) question.options = updatedQuestion.options;
            if (updatedQuestion.correctAnswer !== undefined) question.correctAnswer = updatedQuestion.correctAnswer;
            if (updatedQuestion.explanation) question.explanation = updatedQuestion.explanation;

            await video.save();

            return {
                message: 'Question updated successfully',
                question: video.questions[questionIndex]
            };
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to update question: ${error.message}`);
            } else {
                throw new Error('Failed to update question: ' + String(error));
            }
        }
    }

    @Delete('/:videoId/questions/:questionIndex')
    async deleteQuestion(
        @Param('videoId') videoId: string,
        @Param('questionIndex') questionIndex: number
    ): Promise<{ message: string }> {
        try {
            const video = await Video.findById(videoId);
            if (!video) {
                throw new Error('Video not found');
            }

            if (!video.questions || questionIndex >= video.questions.length) {
                throw new Error('Question not found');
            }

            // Remove the question
            video.questions.splice(questionIndex, 1);
            await video.save();

            return { message: 'Question deleted successfully' };
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to delete question: ${error.message}`);
            } else {
                throw new Error('Failed to delete question: ' + String(error));
            }
        }
    }

    @Get('/:videoId/stats')
    async getQuestionStats(@Param('videoId') videoId: string): Promise<{
        totalQuestions: number;
        questionsBySegment: { segmentIndex: number; questionCount: number }[];
        averageQuestionsPerSegment: number;
        generationStatus: string;
    }> {
        try {
            const video = await Video.findById(videoId);
            if (!video) {
                throw new Error('Video not found');
            }

            const questions = video.questions || [];
            const totalQuestions = questions.length;

            // Group questions by segment
            const segmentGroups = new Map<number, number>();
            questions.forEach(q => {
                const count = segmentGroups.get(q.segmentIndex) || 0;
                segmentGroups.set(q.segmentIndex, count + 1);
            });

            const questionsBySegment = Array.from(segmentGroups.entries()).map(([segmentIndex, questionCount]) => ({
                segmentIndex,
                questionCount
            }));

            const averageQuestionsPerSegment = questionsBySegment.length > 0 
                ? Math.round(totalQuestions / questionsBySegment.length * 10) / 10
                : 0;

            return {
                totalQuestions,
                questionsBySegment,
                averageQuestionsPerSegment,
                generationStatus: video.questionGenerationStatus
            };
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to fetch question stats: ${error.message}`);
            } else {
                throw new Error('Failed to fetch question stats: ' + String(error));
            }
        }
    }

    @Get('/test-llm')
    async testLLMConnection(): Promise<{
        status: string;
        model: string;
        response?: string;
        error?: string;
    }> {
        try {
            return await this.questionService.testLLMConnection();
        } catch (error) {
            return {
                status: 'error',
                model: 'unknown',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

        private shuffleArray<T>(array: T[]): T[] {
            const shuffled = [...array];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
        }
    }