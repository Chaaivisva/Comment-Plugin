from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.models import User
from comments.views import CommentViewSet, NotificationViewSet, CustomAuthToken, receive_email

# API Router (for DRF ViewSets)
router = DefaultRouter()
router.register(r"comments", CommentViewSet, basename="comment")
router.register(r"notifications", NotificationViewSet, basename="notification")

# Simple registration view
@api_view(["POST"])
@permission_classes([AllowAny])
def register_user(request):
    """
    Register a new user.
    Expected: { "username": "abc", "email": "abc@example.com", "password": "secret" }
    """
    username = request.data.get("username")
    email = request.data.get("email")
    password = request.data.get("password")

    if not username or not email or not password:
        return Response({"error": "All fields are required"}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(username=username).exists():
        return Response({"error": "Username already exists"}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(email=email).exists():
        return Response({"error": "Email already exists"}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.create_user(username=username, email=email, password=password)
    return Response({"message": "User registered successfully"}, status=status.HTTP_201_CREATED)

urlpatterns = [
    path('admin/', admin.site.urls),
    path("api/", include(router.urls)),
    path("api/auth/register/", register_user, name="register"),
    path("api/auth/login/", CustomAuthToken.as_view(), name="login"),
    path("api/email/receive/", receive_email, name="receive_email"),
]