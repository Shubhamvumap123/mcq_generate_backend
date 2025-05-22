import mongoose, { Document, Schema } from 'mongoose';

export interface ISegment {
    startTime: number;
    endTime: number;
    text: string;
    segmentIndex: number;
}

export interface IQuestion {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation?: string;
    segmentIndex: number;
}

export interface IVideo extends Document {
    filename: string;
    originalName: string;
    filepath: string;
    size: number;
    mimetype: string;
    duration?: number;
    uploadedAt: Date;
    transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
    questionGenerationStatus: 'pending' | 'processing' | 'completed' | 'failed';
    fullTranscript?: string;
    segments: ISegment[];
    questions: IQuestion[];
    transcriptionError?: string;
    questionGenerationError?: string;
    processedAt?: Date;
}

const SegmentSchema = new Schema<ISegment>({
    startTime: { type: Number, required: true },
    endTime: { type: Number, required: true },
    text: { type: String, required: true },
    segmentIndex: { type: Number, required: true }
});

const QuestionSchema = new Schema<IQuestion>({
    question: { type: String, required: true },
    options: [{ type: String, required: true }],
    correctAnswer: { type: Number, required: true, min: 0, max: 3 },
    explanation: { type: String },
    segmentIndex: { type: Number, required: true }
});

const VideoSchema = new Schema<IVideo>({
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    filepath: { type: String, required: true },
    size: { type: Number, required: true },
    mimetype: { type: String, required: true },
    duration: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
    transcriptionStatus: { 
        type: String, 
        enum: ['pending', 'processing', 'completed', 'failed'], 
        default: 'pending' 
    },
    questionGenerationStatus: { 
        type: String, 
        enum: ['pending', 'processing', 'completed', 'failed'], 
        default: 'pending' 
    },
    fullTranscript: { type: String },
    segments: [SegmentSchema],
    questions: [QuestionSchema],
    transcriptionError: { type: String },
    questionGenerationError: { type: String },
    processedAt: { type: Date }
});

// Indexes for better query performance
VideoSchema.index({ uploadedAt: -1 });
VideoSchema.index({ transcriptionStatus: 1 });
VideoSchema.index({ questionGenerationStatus: 1 });

export const Video = mongoose.model<IVideo>('Video', VideoSchema);