plugins {
    java
    id("dev.arbjerg.lavalink.gradle-plugin") version "1.0.15"
}

group = "dev.takeshi.lavalink"
version = "1.1.0"

// Build against a v4 baseline by default, while allowing a release upgrade to
// be checked without editing this file. These values affect compilation only;
// Lavalink loads the resulting plugin JAR at runtime.
val lavalinkApiVersion = providers.gradleProperty("lavalinkApiVersion").orElse("4.0.0")
val lavalinkServerVersion = providers.gradleProperty("lavalinkServerVersion").orElse("4.0.0")

base {
    archivesName = "takeshi-status-plugin"
}

repositories {
    mavenCentral()
}

lavalinkPlugin {
    name = "takeshi-status-plugin"
    apiVersion = lavalinkApiVersion.get()
    serverVersion = lavalinkServerVersion.get()
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.release = 17
}

dependencies {
    // Lavalink already provides Spring Web/MVC at runtime. Compile against them only.
    compileOnly("org.springframework:spring-web:6.2.5")
    compileOnly("org.springframework:spring-webmvc:6.2.5")
}
