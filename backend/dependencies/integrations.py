from functools import lru_cache

from ..infrastructure.classifiers.ollama import OllamaClassifierAdapter
from ..infrastructure.notifiers.smtp import SmtpNotifier
from ..ports.classifier import ClassifierPort
from ..ports.notifier import NotifierPort


@lru_cache
def _get_classifier_adapter() -> OllamaClassifierAdapter:
    return OllamaClassifierAdapter()


@lru_cache
def _get_notifier_adapter() -> SmtpNotifier:
    return SmtpNotifier()


def get_classifier() -> ClassifierPort:
    return _get_classifier_adapter()


def get_notifier() -> NotifierPort:
    return _get_notifier_adapter()
