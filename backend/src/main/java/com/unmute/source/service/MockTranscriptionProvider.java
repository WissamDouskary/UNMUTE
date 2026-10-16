package com.unmute.source.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Random;

/**
 * Mock transcription provider for development mode.
 * Simulates a ~3 second transcription delay and returns realistic mock transcripts.
 */
@Service
public class MockTranscriptionProvider implements TranscriptionService {

    private static final Logger log = LoggerFactory.getLogger(MockTranscriptionProvider.class);

    private static final Random random = new Random();

    private static final List<String> MOCK_TRANSCRIPTS = List.of(
            """
            Alright, so I've been thinking about the product roadmap for Q1. We need to prioritize \
            three things: first, the user onboarding flow needs a complete redesign. The drop-off rate \
            at step two is around forty percent, which is unacceptable. Second, we should integrate \
            the notification system with the calendar API so users get timely reminders. And third, \
            the analytics dashboard needs real-time data streaming instead of the current batch processing \
            approach. I want the team to scope these out by Friday and present estimates at the Monday standup. \
            Also, remind me to follow up with the design team about the new icon set they were working on.""",

            """
            Meeting notes from the architecture review. We discussed migrating from the monolithic backend \
            to a microservices architecture. The consensus was to start with extracting the authentication \
            service first, since it has the cleanest boundaries. We'll use event-driven communication via \
            Kafka for inter-service messaging. The database will remain PostgreSQL but each service gets \
            its own schema. Timeline estimate is six to eight weeks for the auth service extraction. \
            Key risks identified: data consistency during migration, increased operational complexity, \
            and the need to set up proper distributed tracing. Action items: Sarah will draft the \
            migration plan, Mike will set up the Kafka cluster in staging, and I need to update the \
            API gateway configuration to support the new routing patterns.""",

            """
            Quick brainstorm on the marketing campaign for the product launch. We want to target \
            three segments: enterprise teams of fifty plus users, mid-market companies looking to \
            consolidate their tooling, and individual power users who value productivity. The messaging \
            should focus on three pillars: seamless integration, AI-powered insights, and enterprise-grade \
            security. Budget allocation: sixty percent on digital channels, twenty-five percent on \
            content marketing and thought leadership, and fifteen percent on community events and \
            developer relations. We should also consider a freemium tier to drive adoption. \
            Need to finalize the pricing model by end of this week and get approval from leadership.""",

            """
            Personal reflection on today's productivity. I managed to complete the code review for \
            the payment processing module, but I got sidetracked by an urgent bug in the notification \
            system that took about two hours to debug. Turns out it was a race condition in the \
            WebSocket reconnection logic. I've documented the fix and added a regression test. \
            Tomorrow I need to focus on the quarterly planning document and prepare my presentation \
            for the all-hands meeting. Also, I should schedule time to mentor the new junior developer \
            on our testing practices. Note to self: start using time-blocking more consistently to \
            protect deep work sessions from interruptions.""",

            """
            Research notes on competitive landscape analysis. Product A has strong real-time collaboration \
            features but lacks offline support. Product B has excellent mobile experience but their \
            pricing is significantly higher than ours. Product C recently launched AI summarization \
            which is similar to what we're building. Key differentiators we should emphasize: our \
            cross-platform consistency, the open API ecosystem, and our unique audio-to-structured-knowledge \
            pipeline. We need to accelerate the voice recording feature and the smart task extraction \
            to maintain our competitive edge. The market is moving fast and we need to ship the capture \
            engine by end of this quarter to stay ahead."""
    );

    @Override
    public TranscriptionResult transcribe(String filePath, String fileType, String originalName) {
        log.info("[MOCK] Starting transcription for: {} (type: {})", originalName, fileType);

        // Simulate processing delay (2-4 seconds)
        try {
            long delay = 2000 + random.nextInt(2000);
            Thread.sleep(delay);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Transcription interrupted", e);
        }

        String transcript = MOCK_TRANSCRIPTS.get(random.nextInt(MOCK_TRANSCRIPTS.size()));
        int duration = 30 + random.nextInt(270); // 30s to 5min

        log.info("[MOCK] Transcription complete for: {} ({} seconds)", originalName, duration);

        return new TranscriptionResult(transcript, duration);
    }
}
