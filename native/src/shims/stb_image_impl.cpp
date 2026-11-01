// Única unidade com a implementação do stb_image (decode de PNG/JPG em
// image_decode.cpp e inflate em inflate.cpp — ADR-0650). Separada para o
// alvo de testes linkar o inflate sem NAPI.
#define STB_IMAGE_IMPLEMENTATION
#define STBI_NO_STDIO
#include <stb_image.h>
