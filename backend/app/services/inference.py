"""
Z-AI Chatbot — AI Inference Service
Manages local GGUF model lifecycles using llama-cpp-python.
Ensures thread-safe access and RAM-aware loading/unloading (only one model in RAM at a time).
"""

from __future__ import annotations

import gc
import logging
import threading
from pathlib import Path
from typing import Generator, Any, Optional

import psutil

# llama-cpp-python is an optional heavy dependency.
# The backend will start cleanly without it and raise a 503 if inference is attempted.
try:
    from llama_cpp import Llama as _Llama  # type: ignore
    LLAMA_AVAILABLE = True
except ImportError:
    _Llama = None  # type: ignore
    LLAMA_AVAILABLE = False

from app.core.config import get_settings, MODELS_DIR

logger = logging.getLogger(__name__)

if not LLAMA_AVAILABLE:
    logger.warning(
        "llama-cpp-python is NOT installed. "
        "Install it with: pip install llama-cpp-python\n"
        "Chat inference endpoints will return HTTP 503 until it is installed."
    )

class InferenceError(Exception):
    """Base exception for inference errors."""
    pass

class LlamaInferenceManager:
    """
    Thread-safe manager for the loaded llama.cpp model.
    Enforces a strict single-model-in-RAM policy to prevent memory exhaustion
    on low-end desktop or mobile platforms.
    """
    _instance = None
    _lock = threading.Lock()

    def __new__(cls) -> LlamaInferenceManager:
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(LlamaInferenceManager, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self) -> None:
        if getattr(self, "_initialized", False):
            return
        self._model: Optional[Any] = None  # type: ignore[type-arg]
        self._model_path: Path | None = None
        self._model_id: str | None = None
        self._model_lock = threading.RLock()
        self._initialized = True

    @property
    def loaded_model_id(self) -> str | None:
        """Returns the ID of the currently loaded model, or None."""
        return self._model_id

    @property
    def is_loaded(self) -> bool:
        """Returns whether a model is currently active in RAM."""
        return self._model is not None

    def load_model(
        self,
        model_id: str,
        filename: str,
        context_length: int = 4096,
        gpu_layers: int = 0,  # Default to CPU execution for stability
        ram_required_mb: int = 0,
    ) -> None:
        """
        Loads a GGUF model into memory. Unloads any existing model first.
        Guards against loading when llama-cpp-python is not installed or RAM is insufficient.

        Args:
            model_id: DB ID of the model.
            filename: GGUF filename inside the MODELS_DIR directory.
            context_length: Max context length (n_ctx).
            gpu_layers: Number of layers to offload to GPU (n_gpu_layers).
            ram_required_mb: Minimum RAM needed; 0 = skip check.
        """
        if not LLAMA_AVAILABLE:
            raise InferenceError(
                "llama-cpp-python is not installed. "
                "Run: pip install llama-cpp-python"
            )

        path = MODELS_DIR / filename
        if not path.exists():
            raise InferenceError(f"Model file not found: {filename} in {MODELS_DIR}")

        # RAM guard — prevent OOM crashes on low-end devices
        if ram_required_mb > 0:
            available_mb = psutil.virtual_memory().available // (1024 * 1024)
            if available_mb < ram_required_mb:
                raise InferenceError(
                    f"Insufficient RAM: {available_mb} MB available, "
                    f"{ram_required_mb} MB required for {filename}"
                )

        with self._model_lock:
            # 1. Unload existing model if any
            if self._model is not None:
                if self._model_id == model_id and self._model_path == path:
                    logger.info("Model %s already loaded, skipping reload", filename)
                    return
                self.unload_model()

            logger.info("Loading model %s (context=%d, gpu_layers=%d)...", filename, context_length, gpu_layers)
            try:
                # llama-cpp-python initialization
                self._model = _Llama(
                    model_path=str(path),
                    n_ctx=context_length,
                    n_gpu_layers=gpu_layers,
                    verbose=get_settings().debug,
                )
                self._model_path = path
                self._model_id = model_id
                logger.info("Successfully loaded model: %s", filename)
            except Exception as e:
                logger.error("Failed to load model %s: %s", filename, e)
                self.unload_model()
                raise InferenceError(f"Model load failed: {e}") from e

    def unload_model(self) -> None:
        """Explicitly disposes the current model to free up RAM."""
        with self._model_lock:
            if self._model is not None:
                logger.info("Unloading model: %s", self._model_path.name if self._model_path else "")
                # Delete the llama_cpp object reference
                self._model = None
                self._model_path = None
                self._model_id = None
                # Force garbage collection
                gc.collect()
                logger.info("RAM successfully freed")

    def generate_stream(
        self,
        prompt: str,
        temperature: float = 0.7,
        top_p: float = 0.9,
        max_tokens: int = 1024,
        stop_sequences: list[str] | None = None,
    ) -> Generator[str, None, None]:
        """
        Generates text streamingly.
        
        Args:
            prompt: The formatted prompt template (instruct/chat).
            temperature: Generation temperature.
            top_p: Nucleus sampling probability.
            max_tokens: Max new tokens to generate.
            stop_sequences: Tokens that halt generation.
            
        Yields:
            Generated text chunks.
        """
        if not LLAMA_AVAILABLE:
            raise InferenceError(
                "llama-cpp-python is not installed. "
                "Run: pip install llama-cpp-python"
            )

        with self._model_lock:
            if self._model is None:
                raise InferenceError("No model is currently loaded in RAM.")

            llama = self._model

        logger.debug("Starting streaming inference generation...")
        try:
            stream = llama(
                prompt=prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                stop=stop_sequences or [],
                stream=True,
            )
            for chunk in stream:
                text = chunk["choices"][0]["text"]
                yield text
        except Exception as e:
            logger.error("Inference generation error: %s", e)
            raise InferenceError(f"Inference failed: {e}") from e


# Singleton export
inference_manager = LlamaInferenceManager()
