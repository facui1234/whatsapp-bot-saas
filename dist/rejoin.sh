#!/bin/bash
# Rejoin WhatsBot SaaS portable parts (Linux/Mac)
cat WhatsBot-part00.bin WhatsBot-part01.bin WhatsBot-part02.bin > WhatsBot-SaaS-1.0.0-portable.exe
ls -lh WhatsBot-SaaS-1.0.0-portable.exe
echo "Listo. Ejecutalo (en Windows) o con wine."
