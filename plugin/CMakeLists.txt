# MYCELIA as a plugin: VST3 (macOS + Linux), AU (macOS) and a standalone app.
# The DSP is the C++ port in Source/dsp; the UI is the web UI (../dist)
# embedded into the binary and shown in a WebView.
#
#   ./build.sh            builds the web UI, then the plugins, and installs them
#
# or by hand:
#   npm run build   (in the repo root; the UI must exist before configuring)
#   cmake -S plugin -B plugin/build -G Ninja -DCMAKE_BUILD_TYPE=Release
#   cmake --build plugin/build

cmake_minimum_required(VERSION 3.22)
project(Mycelia VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "")

include(FetchContent)
FetchContent_Declare(JUCE
  GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
  GIT_TAG 8.0.9
  GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(JUCE)

# Copy the built plugins into the user's plugin folders (off in CI).
option(MYCELIA_INSTALL "Install the plugins after building" ON)

set(MYCELIA_FORMATS VST3 Standalone)
if(APPLE)
  list(APPEND MYCELIA_FORMATS AU)
endif()

juce_add_plugin(Mycelia
  COMPANY_NAME "FT"
  BUNDLE_ID "com.ft.mycelia"
  PLUGIN_MANUFACTURER_CODE Ftft
  PLUGIN_CODE Myca
  PRODUCT_NAME "Mycelia"
  DESCRIPTION "bioluminescent polysynth"
  FORMATS ${MYCELIA_FORMATS}
  IS_SYNTH TRUE
  NEEDS_MIDI_INPUT TRUE
  NEEDS_MIDI_OUTPUT FALSE
  IS_MIDI_EFFECT FALSE
  EDITOR_WANTS_KEYBOARD_FOCUS TRUE
  NEEDS_WEB_BROWSER TRUE
  VST3_CATEGORIES Instrument Synth
  AU_MAIN_TYPE kAudioUnitType_MusicDevice
  NEEDS_WEBVIEW2 TRUE
  COPY_PLUGIN_AFTER_BUILD ${MYCELIA_INSTALL})

target_sources(Mycelia PRIVATE
  Source/PluginProcessor.cpp
  Source/PluginEditor.cpp)

target_include_directories(Mycelia PRIVATE Source)

target_compile_definitions(Mycelia PUBLIC
  JUCE_WEB_BROWSER=1
  JUCE_USE_CURL=0
  JUCE_VST3_CAN_REPLACE_VST2=0)

# The built web UI, embedded. Rebuild it (npm run build) and re-run the build
# after changing anything under src/.
set(MYCELIA_UI_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../dist")
if(NOT EXISTS "${MYCELIA_UI_DIR}/index.html")
  message(FATAL_ERROR "No web UI in ${MYCELIA_UI_DIR}: run `npm run build` in the repo root first (or use plugin/build.sh).")
endif()
file(GLOB_RECURSE MYCELIA_UI_FILES CONFIGURE_DEPENDS "${MYCELIA_UI_DIR}/*")
juce_add_binary_data(MyceliaUI SOURCES ${MYCELIA_UI_FILES})

target_link_libraries(Mycelia
  PRIVATE
    MyceliaUI
    juce::juce_audio_utils
    juce::juce_gui_extra
  PUBLIC
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags)
