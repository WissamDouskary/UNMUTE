# Compile inside the image so `docker compose up --build` always ships current source.
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
COPY src ./src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre

WORKDIR /app

COPY --from=build /build/target/unmute-backend-0.1.0-SNAPSHOT.jar app.jar

RUN groupadd -r unmute && useradd -r -g unmute unmute \
    && mkdir -p /app/uploads && chown -R unmute:unmute /app
USER unmute

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
