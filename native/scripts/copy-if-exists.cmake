# cmake -DSRC=<arquivo> -DDST_DIR=<pasta> -P copy-if-exists.cmake
# Copia SRC para DST_DIR se SRC existir. Roda na hora do build, não no configure: uma
# dependência opcional baixada depois de configurar (o DXC do fetch-deps, SPEC-0731)
# também chega à pasta do exe sem precisar reconfigurar.
if(EXISTS "${SRC}")
  file(COPY "${SRC}" DESTINATION "${DST_DIR}")
endif()
