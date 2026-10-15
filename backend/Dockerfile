# ---- Build stage ----
FROM eclipse-temurin:21-jdk AS build

WORKDIR /app

# Copy Maven Wrapper and pom
COPY mvnw mvnw.cmd ./
COPY .mvn .mvn
COPY pom.xml .

# Copy source and package
COPY src src
RUN chmod +x mvnw && ./mvnw clean package -DskipTests -B

# ---- Runtime stage ----
FROM eclipse-temurin:21-jre

WORKDIR /app

# Copy the built JAR
COPY --from=build /app/target/*.jar app.jar

# Non-root user for security
RUN groupadd -r unmute && useradd -r -g unmute unmute
USER unmute

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
