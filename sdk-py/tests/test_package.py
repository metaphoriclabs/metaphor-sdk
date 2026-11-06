import metaphor_sdk


def test_exposes_installed_version():
    assert metaphor_sdk.__version__
