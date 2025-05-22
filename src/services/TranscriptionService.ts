import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { ISegment } from '../models/Video';

export interface TranscriptionResult {
    fullTranscript: string;
    segments: ISegment[];
}

export class TranscriptionService {
    private whisperPath: string;
    private segmentDuration: number = 300; // 5 minutes in seconds

    constructor() {
        // Path to Whisper executable - adjust based on your installation
        this.whisperPath = process.env.WHISPER_PATH || 'whisper';
    }

    async transcribeVideo(videoPath: string): Promise<TranscriptionResult> {
        try {
            console.log(`Starting transcription for: ${videoPath}`);

            // Generate output path for transcript
            const outputDir = path.dirname(videoPath);
            const baseName = path.basename(videoPath, path.extname(videoPath));
            const transcriptPath = path.join(outputDir, `${baseName}_transcript.json`);

            // Run Whisper transcription
            await this.runWhisper(videoPath, outputDir);

            // Read the generated transcript
            const transcriptData = await this.readTranscriptFile(transcriptPath);

            // Process transcript into segments
            const segments = this.segmentTranscript(transcriptData);

            // Generate full transcript text
            const fullTranscript = segments.map(segment => segment.text).join(' ');

            // Clean up temporary files
            this.cleanupTempFiles(outputDir, baseName);

            return {
                fullTranscript,
                segments
            };

        } catch (error) {
            console.error('Transcription error:', error);
            const message = (error instanceof Error) ? error.message : String(error);
            throw new Error(`Transcription failed: ${message}`);
        }
    }

    private async runWhisper(videoPath: string, outputDir: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const args = [
                videoPath,
                '--output_dir', outputDir,
                '--output_format', 'json',
                '--verbose', 'False',
                '--language', 'en' // You can make this configurable
            ];

            console.log(`Running Whisper command: ${this.whisperPath} ${args.join(' ')}`);

            const whisperProcess = spawn(this.whisperPath, args);

            let stdout = '';
            let stderr = '';

            whisperProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            whisperProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            whisperProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('Whisper transcription completed successfully');
                    resolve();
                } else {
                    console.error('Whisper process failed:', stderr);
                    reject(new Error(`Whisper process exited with code ${code}: ${stderr}`));
                }
            });

            whisperProcess.on('error', (error) => {
                console.error('Failed to start Whisper process:', error);
                reject(new Error(`Failed to start Whisper: ${error.message}`));
            });

            // Set timeout for long videos
            setTimeout(() => {
                whisperProcess.kill();
                reject(new Error('Whisper process timeout'));
            }, 30 * 60 * 1000); // 30 minutes timeout
        });
    }

    private async readTranscriptFile(transcriptPath: string): Promise<any> {
        try {
            // Whisper generates files with the base name + .json
            const possiblePaths = [
                transcriptPath,
                transcriptPath.replace('_transcript', ''),
                transcriptPath.replace('.json', '.json')
            ];

            let data: string | null = null;
            let usedPath: string | null = null;

            for (const filePath of possiblePaths) {
                if (fs.existsSync(filePath)) {
                    data = fs.readFileSync(filePath, 'utf8');
                    usedPath = filePath;
                    break;
                }
            }

            if (!data) {
                throw new Error(`Transcript file not found. Checked paths: ${possiblePaths.join(', ')}`);
            }

            console.log(`Reading transcript from: ${usedPath}`);
            return JSON.parse(data);

        } catch (error) {
            const message = (error instanceof Error) ? error.message : String(error);
            throw new Error(`Failed to read transcript file: ${message}`);
        }
    }

    private segmentTranscript(transcriptData: any): ISegment[] {
        try {
            const segments: ISegment[] = [];
            
            if (!transcriptData.segments || !Array.isArray(transcriptData.segments)) {
                throw new Error('Invalid transcript format: missing segments array');
            }

            let currentSegment: ISegment | null = null;
            let segmentIndex = 0;

            for (const segment of transcriptData.segments) {
                const startTime = segment.start || 0;
                const endTime = segment.end || startTime + 1;
                const text = (segment.text || '').trim();

                if (!text) continue;

                // If no current segment, start a new one
                if (!currentSegment) {
                    currentSegment = {
                        startTime,
                        endTime,
                        text,
                        segmentIndex
                    };
                } else {
                    // Check if we should continue current segment or start a new one
                    const segmentDuration = currentSegment.endTime - currentSegment.startTime;
                    
                    if (segmentDuration >= this.segmentDuration) {
                        // Current segment is long enough, save it and start new one
                        segments.push(currentSegment);
                        segmentIndex++;
                        
                        currentSegment = {
                            startTime,
                            endTime,
                            text,
                            segmentIndex
                        };
                    } else {
                        // Continue current segment
                        currentSegment.endTime = endTime;
                        currentSegment.text += ' ' + text;
                    }
                }
            }

            // Add the last segment if it exists
            if (currentSegment) {
                segments.push(currentSegment);
            }

            // Ensure each segment has reasonable length
            const finalSegments = this.ensureMinimumSegmentLength(segments);

            console.log(`Created ${finalSegments.length} segments from transcript`);
            return finalSegments;

        } catch (error) {
            const message = (error instanceof Error) ? error.message : String(error);
            throw new Error(`Failed to segment transcript: ${message}`);
        }
    }

    private ensureMinimumSegmentLength(segments: ISegment[]): ISegment[] {
        const minWords = 50; // Minimum words per segment
        const result: ISegment[] = [];

        let currentSegment: ISegment | null = null;

        for (const segment of segments) {
            const wordCount = segment.text.split(' ').length;

            if (!currentSegment) {
                currentSegment = { ...segment };
            } else if (wordCount < minWords) {
                // Merge with current segment
                currentSegment.endTime = segment.endTime;
                currentSegment.text += ' ' + segment.text;
            } else {
                // Current segment is good, save it and start new one
                result.push(currentSegment);
                currentSegment = { ...segment };
            }
        }

        // Add the last segment
        if (currentSegment) {
            result.push(currentSegment);
        }

        // Re-index segments
        return result.map((segment, index) => ({
            ...segment,
            segmentIndex: index
        }));
    }

    private cleanupTempFiles(outputDir: string, baseName: string): void {
        try {
            const extensions = ['.json', '.txt', '.srt', '.vtt'];
            
            for (const ext of extensions) {
                const filePath = path.join(outputDir, baseName + ext);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
        } catch (error) {
            const message = (error instanceof Error) ? error.message : String(error);
            console.warn('Failed to cleanup temp files:', message);
        }
    }

    // Alternative method for testing without actual Whisper
    async transcribeVideoMock(videoPath: string): Promise<TranscriptionResult> {
        console.log(`Mock transcription for: ${videoPath}`);
        
        // Generate mock transcript segments
        const mockSegments: ISegment[] = [
            {
                startTime: 0,
                endTime: 300,
                text: "This is the first segment of the video transcript. It contains important information about the topic being discussed. The speaker explains various concepts and provides examples to illustrate their points. This segment covers the introduction and overview of the main subject matter.",
                segmentIndex: 0
            },
            {
                startTime: 300,
                endTime: 600,
                text: "In this second segment, we dive deeper into the technical details. The explanation becomes more specific and includes practical applications. Various methodologies are discussed along with their advantages and disadvantages. Real-world examples are provided to demonstrate the concepts.",
                segmentIndex: 1
            },
            {
                startTime: 600,
                endTime: 900,
                text: "The final segment concludes the presentation with a summary of key points. Important takeaways are highlighted and future directions are discussed. The speaker provides recommendations and best practices based on the information presented throughout the video.",
                segmentIndex: 2
            }
        ];

        const fullTranscript = mockSegments.map(s => s.text).join(' ');

        return {
            fullTranscript,
            segments: mockSegments
        };
    }
}