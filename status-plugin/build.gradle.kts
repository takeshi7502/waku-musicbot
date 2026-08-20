plugins {
    java
    id("dev.arbjerg.lavalink.gradle-plugin") version "1.0.15"
}

group = "dev.takeshi.lavalink"
version = "1.0.0"

base {
    archivesName = "takeshi-status-plugin"
}

repositories {
    mavenCentral()
}

lavalinkPlugin {
    name = "takeshi-status-plugin"
    apiVersion = "4.2.1"
    serverVersion = "4.2.2"
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
    // Lavalink already provides Spring Web at runtime. Compile against it only.
    compileOnly("org.springframework:spring-web:6.2.5")
}
