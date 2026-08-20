@ECHO OFF
SETLOCAL
SET "APP_HOME=%~dp0"
SET "WRAPPER_JAR=%APP_HOME%gradle\wrapper\gradle-wrapper.jar"

IF NOT EXIST "%WRAPPER_JAR%" (
  ECHO Missing "%WRAPPER_JAR%". Re-clone the repository or restore the Gradle wrapper.
  EXIT /B 1
)

java %JAVA_OPTS% -classpath "%WRAPPER_JAR%" org.gradle.wrapper.GradleWrapperMain %*
ENDLOCAL
