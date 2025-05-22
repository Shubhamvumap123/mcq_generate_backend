import { JsonController, Get, Post, Param, Body } from 'routing-controllers';
import { Video } from '../models/Video';
import { TranscriptionService } from '../services/TranscriptionService';

@JsonController('/api/transcriptions')
export class TranscriptionController {
    private transcriptionService = new TranscriptionService();

    @Get('/:videoId')
    async getTranscription(@Param('videoId') videoId: string): Promise<{
        fullTranscript: string;
        segments: any[];
        status: string;
    }> {
        try {
            const video = await Video.findById(videoId);
            if (!video) {
                throw new Error('Video not found');
            }

            return {
                fullTranscript: video.fullTranscript || '',
                segments: video.segments || [],
                status: video.transcriptionStatus
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch transcription: ${message}`);
        }
    }

    @Get('/:videoId/segments')
    async getTranscriptSegments(@Param('videoId') videoId: string): Promise<{
        segments: any[];
        totalSegments: number;
    }> {
        try {
            const video = await Video.findById(videoId);
            if (!video) {
                throw new Error('Video not found');
            }

            return {
                segments: video.segments || [],
                totalSegments: video.segments?.length || 0
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch segments: ${message}`);
        }
    }

    @Get('/:videoId/segments/:segmentIndex')
    async getSegment(
        @Param('videoId') videoId: string,
        @Param('segmentIndex') segmentIndex: number
    ): Promise<any> {
        try {
            const video = await Video.findById(videoId);
            if (!video) {
                throw new Error('Video not found');
            }

            const segment = video.segments?.find(s => s.segmentIndex === segmentIndex);
            if (!segment) {
                throw new Error('Segment not found');
            }

            return segment;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch segment: ${message}`);
        }
    }

    @Post('/:videoId/retranscribe')
    async retranscribeVideo(@Param('videoId') videoId: string): Promise<{ message: string }> {
        try {
            const video = await Video.findById(videoId);
            if (!video) {
                throw new Error('Video not found');
            }

            // Reset transcription status
            video.transcriptionStatus = 'processing';
            video.fullTranscript = undefined;
            video.segments = [];
            video.transcriptionError = undefined;
            await video.save();

            // Start retranscription in background
            this.retranscribeAsync(videoId);

            return { message: 'Retranscription started' };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to start retranscription: ${message}`);
        }
    }

    @Get('/:videoId/export')
    async exportTranscript(@Param('videoId') videoId: string): Promise<{
        transcript: string;
        format: string;
        filename: string;
    }> {
        try {
            const video = await Video.findById(videoId);
            if (!video) {
                throw new Error('Video not found');
            }

            if (!video.fullTranscript) {
                throw new Error('No transcript available');
            }

            // Format transcript for export
            const formattedTranscript = this.formatTranscriptForExport(video);

            return {
                transcript: formattedTranscript,
                format: 'text',
                filename: `${video.originalName}_transcript.txt`
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to export transcript: ${message}`);
        }
    }

    @Get('/:videoId/srt')
    async getTranscriptAsSRT(@Param('videoId') videoId: string): Promise<{
        srt: string;
        filename: string;
    }> {
        try {
            const video = await Video.findById(videoId);
            if (!video) {
                throw new Error('Video not found');
            }

            if (!video.segments || video.segments.length === 0) {
                throw new Error('No segments available');
            }

            const srt = this.generateSRT(video.segments);

            return {
                srt,
                filename: `${video.originalName}_subtitles.srt`
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to generate SRT: ${message}`);
        }
    }

    @Get('/:videoId/vtt')
    async getTranscriptAsVTT(@Param('videoId') videoId: string): Promise<{
        vtt: string;
        filename: string;
    }> {
        try {
            const video = await Video.findById(videoId);
            if (!video) {
                throw new Error('Video not found');
            }

            if (!video.segments || video.segments.length === 0) {
                throw new Error('No segments available');
            }

            const vtt = this.generateVTT(video.segments);

            return {
                vtt,
                filename: `${video.originalName}_subtitles.vtt`
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to generate VTT: ${message}`);
        }
    }

    private async retranscribeAsync(videoId: string): Promise<void> {
        try {
            const video = await Video.findById(videoId);
            if (!video) {
                console.error(`Video not found for retranscription: ${videoId}`);
                return;
            }

            console.log(`Starting retranscription for: ${video.originalName}`);

            const transcriptionResult = await this.transcriptionService.transcribeVideo(video.filepath);
            
            video.fullTranscript = transcriptionResult.fullTranscript;
            video.segments = transcriptionResult.segments;
            video.transcriptionStatus = 'completed';
            await video.save();

            console.log(`Retranscription completed for: ${video.originalName}`);

        } catch (error) {
            console.error(`Retranscription failed for video ${videoId}:`, error);
            
            try {
                const video = await Video.findById(videoId);
                if (video) {
                    video.transcriptionStatus = 'failed';
                    video.transcriptionError = error instanceof Error ? error.message : String(error);
                    await video.save();
                }
            } catch (updateError) {
                console.error('Failed to update video status:', updateError);
            }
        }
    }

    private formatTranscriptForExport(video: any): string {
        let formatted = `Transcript for: ${video.originalName}\n`;
        formatted += `Generated on: ${new Date().toISOString()}\n`;
        formatted += `Duration: ${video.duration ? `${Math.round(video.duration / 60)} minutes` : 'Unknown'}\n`;
        formatted += `\n${'='.repeat(50)}\n\n`;

        if (video.segments && video.segments.length > 0) {
            video.segments.forEach((segment: any, index: number) => {
                const startMin = Math.floor(segment.startTime / 60);
                const startSec = Math.floor(segment.startTime % 60);
                const endMin = Math.floor(segment.endTime / 60);
                const endSec = Math.floor(segment.endTime % 60);

                formatted += `[${startMin}:${startSec.toString().padStart(2, '0')} - ${endMin}:${endSec.toString().padStart(2, '0')}]\n`;
                formatted += `${segment.text}\n\n`;
            });
        } else {
            formatted += video.fullTranscript || 'No transcript available';
        }

        return formatted;
    }

    private generateSRT(segments: any[]): string {
        let srt = '';
        
        segments.forEach((segment, index) => {
            const startTime = this.formatSRTTime(segment.startTime);
            const endTime = this.formatSRTTime(segment.endTime);
            
            srt += `${index + 1}\n`;
            srt += `${startTime} --> ${endTime}\n`;
            srt += `${segment.text}\n\n`;
        });

        return srt;
    }

    private generateVTT(segments: any[]): string {
        let vtt = 'WEBVTT\n\n';
        
        segments.forEach((segment) => {
            const startTime = this.formatVTTTime(segment.startTime);
            const endTime = this.formatVTTTime(segment.endTime);
            
            vtt += `${startTime} --> ${endTime}\n`;
            vtt += `${segment.text}\n\n`;
        });

        return vtt;
    }

    private formatSRTTime(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const milliseconds = Math.floor((seconds % 1) * 1000);

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
    }

    private formatVTTTime(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const milliseconds = Math.floor((seconds % 1) * 1000);

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    }
}