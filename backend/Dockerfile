# ---- Runtime stage ----
FROM eclipse-temurin:21-jre

WORKDIR /app

# Copy the built JAR from target directory
COPY target/unmute-backend-0.1.0-SNAPSHOT.jar app.jar

# Non-root user for security
RUN groupadd -r unmute && useradd -r -g unmute unmute
USER unmute

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
