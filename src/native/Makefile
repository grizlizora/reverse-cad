# Makefile for OpenCASCADE C++ Native STEP Synthesizer
CXX = clang++
CXXFLAGS = -O3 -std=c++17 -mcpu=apple-m1
BREW_PREFIX = $(shell brew --prefix 2>/dev/null || echo /opt/homebrew)
OCCT_INC = -I$(BREW_PREFIX)/include/opencascade
OCCT_LIB = -L$(BREW_PREFIX)/lib -lTKernel -lTKMath -lTKG2d -lTKG3d -lTKGeomBase -lTKBRep -lTKTopAlgo -lTKPrim -lTKBO -lTKSTEP -lTKSTEPCAF -lTKXCAF -lTKLCAF

TARGET = ../../build/occt_step_synth

all: $(TARGET)

$(TARGET): occt_step_synth.cpp
	mkdir -p ../../build
	@if [ -d "$(BREW_PREFIX)/include/opencascade" ]; then \
		echo "[Native Build] Building with OpenCASCADE support..."; \
		$(CXX) $(CXXFLAGS) -DHAS_OPENCASCADE $(OCCT_INC) $< -o $@ $(OCCT_LIB); \
	else \
		echo "[Native Build] OpenCASCADE headers not found in Homebrew, compiling standalone..."; \
		$(CXX) $(CXXFLAGS) $< -o $@; \
	fi

clean:
	rm -f $(TARGET)
