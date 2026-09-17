FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml ./
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -ntp verify

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
RUN apt-get update && apt-get install --yes --no-install-recommends curl && rm -rf /var/lib/apt/lists/* \
    && groupadd --system eco && useradd --system --gid eco eco
ENV JAVA_TOOL_OPTIONS="-Xms128m -Xmx384m"
COPY --from=build /workspace/target/backend-*.jar app.jar
USER eco
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
